alter table sontu_private.event_seating_assignments
  alter column event_participant_id drop not null,
  add column host_user_id uuid references auth.users(id) on delete cascade;

alter table sontu_private.event_seating_assignments
  drop constraint event_seating_assignments_event_participant_id_attendee_nam_key,
  add constraint event_seating_assignment_subject_check check (
    (event_participant_id is not null)::integer
      + (host_user_id is not null)::integer = 1
  );

create unique index event_seating_assignment_participant_name
  on sontu_private.event_seating_assignments(event_participant_id,attendee_name)
  where event_participant_id is not null;
create unique index event_seating_assignment_host
  on sontu_private.event_seating_assignments(event_instance_id,host_user_id)
  where host_user_id is not null;

create or replace function sontu_private.participant_seating(event_id uuid,token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare participant_id uuid; e sontu_private.event_instances;
begin
  participant_id:=sontu_private.current_event_participant(event_id,token);
  if participant_id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into e from sontu_private.event_instances
  where id=participant_seating.event_id and event_kind='SIMPLE';
  if not found or e.lifecycle in ('DRAFT','CANCELLED') then
    return sontu_private.fail('INVITATION_UNAVAILABLE');
  end if;
  return jsonb_build_object('status','ready','assignments',coalesce((
    select jsonb_agg(jsonb_build_object(
      'attendee_name',a.attendee_name,'table_label',t.label
    ) order by a.attendee_name)
    from sontu_private.event_seating_assignments a
    join sontu_private.event_seating_tables t on t.id=a.seating_table_id
    where a.event_participant_id=participant_id
  ),'[]'::jsonb));
end
$$;

create or replace function sontu_private.event_seating(
  action text,event_id uuid,table_id uuid default null,
  participant_id uuid default null,attendee_name text default null,
  table_label text default null,table_capacity integer default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); e sontu_private.event_instances;
  t sontu_private.event_seating_tables;
  participant_row sontu_private.event_participants;
  clean_label text:=btrim(coalesce(table_label,''));
  clean_name text:=btrim(coalesce(attendee_name,''));
  assigned integer;
begin
  if action not in ('READ','UPSERT_TABLE','DELETE_TABLE','ASSIGN','UNASSIGN') then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  select * into e from sontu_private.event_instances ei
  where ei.id=event_seating.event_id and ei.host_owner_user_id=actor and ei.event_kind='SIMPLE'
  for update;
  if actor is null or not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='UPSERT_TABLE' then
    if char_length(clean_label) not between 1 and 80 or table_capacity not between 1 and 100 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
    if table_id is null then
      insert into sontu_private.event_seating_tables(event_instance_id,label,capacity)
      values(e.id,clean_label,table_capacity);
    else
      select * into t from sontu_private.event_seating_tables st
      where st.id=table_id and st.event_instance_id=e.id for update;
      if not found then return sontu_private.fail('INVALID_INPUT'); end if;
      select count(*) into assigned from sontu_private.event_seating_assignments esa
      where esa.seating_table_id=t.id;
      if assigned>table_capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      update sontu_private.event_seating_tables st
      set label=clean_label,capacity=table_capacity,updated_at=now() where st.id=t.id;
    end if;
  elsif action='DELETE_TABLE' then
    delete from sontu_private.event_seating_tables st
    where st.id=table_id and st.event_instance_id=e.id;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  elsif action='ASSIGN' then
    select * into t from sontu_private.event_seating_tables st
    where st.id=table_id and st.event_instance_id=e.id for update;
    if t.id is null or char_length(clean_name) not between 1 and 100 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
    select count(*) into assigned from sontu_private.event_seating_assignments esa
    where esa.seating_table_id=t.id;
    if assigned>=t.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
    if participant_id=e.id then
      delete from sontu_private.event_seating_assignments esa
      where esa.event_instance_id=e.id and esa.host_user_id=actor;
      insert into sontu_private.event_seating_assignments(
        event_instance_id,seating_table_id,event_participant_id,host_user_id,attendee_name
      ) values(e.id,t.id,null,actor,clean_name);
    else
      select * into participant_row from sontu_private.event_participants ep
      where ep.id=participant_id and ep.event_instance_id=e.id
        and ep.commitment_state='CONFIRMED';
      if not found then return sontu_private.fail('INVALID_INPUT'); end if;
      delete from sontu_private.event_seating_assignments esa
      where esa.event_participant_id=participant_row.id and esa.attendee_name=clean_name;
      insert into sontu_private.event_seating_assignments(
        event_instance_id,seating_table_id,event_participant_id,host_user_id,attendee_name
      ) values(e.id,t.id,participant_row.id,null,clean_name);
    end if;
  elsif action='UNASSIGN' then
    if participant_id=e.id then
      delete from sontu_private.event_seating_assignments esa
      where esa.event_instance_id=e.id and esa.host_user_id=actor;
    else
      delete from sontu_private.event_seating_assignments esa
      where esa.event_instance_id=e.id and esa.event_participant_id=participant_id
        and esa.attendee_name=clean_name;
    end if;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  end if;
  if action<>'READ' then
    insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(e.id,gen_random_uuid(),actor::text,'event_seating_'||lower(action),
      jsonb_build_object('table_id',table_id,'participant_id',participant_id,'attendee_name',clean_name));
  end if;
  return jsonb_build_object('status','ready','tables',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',st.id,'label',st.label,'capacity',st.capacity,
      'assigned_count',(select count(*) from sontu_private.event_seating_assignments a where a.seating_table_id=st.id),
      'assignments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'participant_id',coalesce(a.event_participant_id,a.event_instance_id),
          'attendee_name',a.attendee_name,
          'invitee_name',coalesce(ep.display_name,nullif(ap.display_name,''),ap.first_name,'Event host')
        ) order by a.attendee_name)
        from sontu_private.event_seating_assignments a
        left join sontu_private.event_participants ep on ep.id=a.event_participant_id
        left join sontu_private.account_profiles ap on ap.user_id=a.host_user_id
        where a.seating_table_id=st.id
      ),'[]'::jsonb)
    ) order by st.label)
    from sontu_private.event_seating_tables st where st.event_instance_id=e.id
  ),'[]'::jsonb));
end
$$;

revoke all on function sontu_private.participant_seating(uuid,text),
  sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer)
  from public,anon,authenticated;
grant execute on function sontu_private.participant_seating(uuid,text) to anon,authenticated;
grant execute on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) to authenticated;
