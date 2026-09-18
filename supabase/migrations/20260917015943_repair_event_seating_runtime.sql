create or replace function sontu_private.event_seating(
  action text, event_id uuid, table_id uuid default null,
  participant_id uuid default null, attendee_name text default null,
  table_label text default null, table_capacity integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; t sontu_private.event_seating_tables; p sontu_private.event_participants; clean_label text:=btrim(coalesce(table_label,'')); clean_name text:=btrim(coalesce(attendee_name,'')); assigned integer;
begin
  if action not in ('READ','UPSERT_TABLE','DELETE_TABLE','ASSIGN','UNASSIGN') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into e from sontu_private.event_instances where id=event_seating.event_id and host_owner_user_id=actor and event_kind='SIMPLE' for update;
  if actor is null or not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='UPSERT_TABLE' then
    if char_length(clean_label) not between 1 and 80 or table_capacity not between 1 and 100 then return sontu_private.fail('INVALID_INPUT'); end if;
    if table_id is null then
      insert into sontu_private.event_seating_tables(event_instance_id,label,capacity) values(e.id,clean_label,table_capacity);
    else
      select * into t from sontu_private.event_seating_tables where id=table_id and event_instance_id=e.id for update;
      if not found then return sontu_private.fail('INVALID_INPUT'); end if;
      select count(*) into assigned from sontu_private.event_seating_assignments where seating_table_id=t.id;
      if assigned>table_capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      update sontu_private.event_seating_tables set label=clean_label,capacity=table_capacity,updated_at=now() where id=t.id;
    end if;
  elsif action='DELETE_TABLE' then
    delete from sontu_private.event_seating_tables where id=table_id and event_instance_id=e.id;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  elsif action='ASSIGN' then
    select * into t from sontu_private.event_seating_tables where id=table_id and event_instance_id=e.id for update;
    select * into p from sontu_private.event_participants where id=participant_id and event_instance_id=e.id and commitment_state='CONFIRMED';
    if not found or t.id is null or char_length(clean_name) not between 1 and 100 then return sontu_private.fail('INVALID_INPUT'); end if;
    select count(*) into assigned from sontu_private.event_seating_assignments where seating_table_id=t.id;
    if assigned>=t.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
    delete from sontu_private.event_seating_assignments where event_participant_id=p.id and attendee_name=clean_name;
    insert into sontu_private.event_seating_assignments(event_instance_id,seating_table_id,event_participant_id,attendee_name) values(e.id,t.id,p.id,clean_name);
  elsif action='UNASSIGN' then
    delete from sontu_private.event_seating_assignments where event_instance_id=e.id and event_participant_id=participant_id and attendee_name=clean_name;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  end if;
  insert into sontu_private.audit_entries(event_instance_id,actor_ref,audit_kind,metadata)
    values(e.id,actor::text,'event_seating_'||lower(action),jsonb_build_object('table_id',table_id,'participant_id',participant_id,'attendee_name',clean_name));
  return jsonb_build_object('status','ready','tables',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'label',st.label,'capacity',st.capacity,'assigned_count',(select count(*) from sontu_private.event_seating_assignments a where a.seating_table_id=st.id),'assignments',coalesce((select jsonb_agg(jsonb_build_object('participant_id',a.event_participant_id,'attendee_name',a.attendee_name,'invitee_name',p.display_name) order by a.attendee_name) from sontu_private.event_seating_assignments a join sontu_private.event_participants p on p.id=a.event_participant_id where a.seating_table_id=st.id),'[]'::jsonb)) order by st.label) from sontu_private.event_seating_tables st where st.event_instance_id=e.id),'[]'::jsonb));
end $$;


revoke all on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) from public;
grant execute on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) to authenticated;
