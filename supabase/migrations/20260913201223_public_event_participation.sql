-- Complete the free public-event participation loop while keeping invitations
-- and authenticated participant identity as distinct, reconcilable facts.
alter table sontu_private.event_participants
  add column participant_user_id uuid references auth.users(id) on delete set null;

create unique index event_participants_event_user_unique
  on sontu_private.event_participants(event_instance_id,participant_user_id)
  where participant_user_id is not null;
create unique index event_participants_event_email_unique
  on sontu_private.event_participants(event_instance_id,lower(invitation_email))
  where invitation_email is not null;

create function sontu_private.public_event_participation(
  event_id uuid,
  action text default 'READ',
  expected_version integer default null,
  operation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  mail text:=sontu_private.verified_email();
  event_row sontu_private.event_instances;
  version_row sontu_private.event_versions;
  participant sontu_private.event_participants;
  prior_operation sontu_private.operations;
  participant_count integer;
  total_going integer;
  display text;
  fingerprint text;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if mail is null then return sontu_private.fail('VERIFY_EMAIL'); end if;
  if action not in ('READ','JOIN','WITHDRAW') then return sontu_private.fail('INVALID_INPUT'); end if;
  if action<>'READ' and operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;

  fingerprint:=jsonb_build_object('actor',actor,'event_id',event_id,'action',action,'version',expected_version)::text;
  if action<>'READ' then
    select * into prior_operation from sontu_private.operations where id=operation_id;
    if found then
      if prior_operation.actor_ref<>actor::text or prior_operation.request_fingerprint<>fingerprint then
        return sontu_private.fail('IDEMPOTENCY_MISMATCH');
      end if;
      return prior_operation.result;
    end if;
  end if;

  select * into event_row from sontu_private.event_instances
    where id=public_event_participation.event_id and event_kind='SIMPLE' and visibility='PUBLIC'
    for update;
  if not found or event_row.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into version_row from sontu_private.event_versions
    where event_instance_id=event_row.id and version_number=event_row.current_version_number;
  select * into participant from sontu_private.event_participants p
    where p.event_instance_id=event_row.id
      and (p.participant_user_id=actor or lower(p.invitation_email)=mail)
    order by (p.participant_user_id=actor) desc limit 1;
  select count(*) into participant_count from sontu_private.event_participants p
    where p.event_instance_id=event_row.id and p.commitment_state='CONFIRMED';
  select participant_count + 1 + count(*) into total_going
    from sontu_private.event_team_members m where m.event_instance_id=event_row.id and m.attends_event;

  if action='READ' then
    return jsonb_build_object(
      'status','ready','commitment_state',participant.commitment_state,
      'current_version',event_row.current_version_number,
      'participant_count',participant_count,'going_count',total_going,
      'capacity',version_row.capacity,
      'full',version_row.capacity is not null and participant_count>=version_row.capacity,
      'responses_open',event_row.lifecycle='PUBLISHED' and version_row.starts_at>now()
    );
  end if;
  if expected_version is distinct from event_row.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if;
  if event_row.lifecycle<>'PUBLISHED' or version_row.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
  if event_row.host_owner_user_id=actor then return sontu_private.fail('INVALID_STATE'); end if;

  if action='JOIN' then
    if participant.id is not null and participant.commitment_state='CONFIRMED' then
      result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
    else
      if version_row.capacity is not null and participant_count>=version_row.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      select coalesce(nullif(p.display_name,''),p.first_name,split_part(mail,'@',1)) into display
        from sontu_private.account_profiles p where p.user_id=actor;
      display:=coalesce(display,split_part(mail,'@',1));
      if participant.id is null then
        insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,invitation_state,participant_user_id)
        values(event_row.id,display,'CONFIRMED',mail,null,actor) returning * into participant;
      else
        update sontu_private.event_participants set participant_user_id=actor,display_name=display,
          commitment_state='CONFIRMED',invitation_state=case when invitation_state is null then null else 'ACCEPTED' end
        where id=participant.id returning * into participant;
      end if;
      result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
    end if;
  else
    if participant.id is null or participant.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;
    update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=participant.id;
    result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
  end if;

  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
    values(operation_id,actor::text,lower(action)||'_public_event',event_row.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(event_row.id,operation_id,actor::text,lower(action)||'_public_event',jsonb_build_object('version',event_row.current_version_number,'participant_id',participant.id));
  return result;
end $$;

create function public.sontu_public_event_participation(event_id uuid,action text default 'READ',expected_version integer default null,operation_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.public_event_participation(event_id,action,expected_version,operation_id) $$;
revoke all on function sontu_private.public_event_participation(uuid,text,integer,uuid),public.sontu_public_event_participation(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function sontu_private.public_event_participation(uuid,text,integer,uuid),public.sontu_public_event_participation(uuid,text,integer,uuid) to authenticated;

create or replace function sontu_private.my_events() returns jsonb
language plpgsql security definer set search_path='' as $$
declare mail text:=sontu_private.verified_email();
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(x order by x.starts_at nulls last,x.id) from (
  select e.id,e.lifecycle,e.event_category as category,e.event_format as format,
   v.title,v.starts_at,v.ends_at,v.description,v.timezone,v.venue_label,v.cover_key,v.capacity,
   e.host_owner_user_id=auth.uid() as hosting,p.commitment_state,p.invitation_state,
   oc.owner_kind,case when oc.owner_kind='ORGANIZATION' then o.display_name else 'Personal' end as owner_name
  from sontu_private.event_instances e
  join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  join sontu_private.event_owner_contexts oc on oc.event_instance_id=e.id
  left join sontu_private.organizations o on o.id=oc.organization_id
  left join sontu_private.event_participants p on p.event_instance_id=e.id and (
    p.participant_user_id=auth.uid() or (p.participant_user_id is null and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now()))
  where e.event_kind='SIMPLE' and (e.host_owner_user_id=auth.uid() or (p.id is not null and e.lifecycle<>'DRAFT'))
 ) x),'[]'));
end $$;

create or replace function sontu_private.event_hub(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); mail text:=sontu_private.verified_email(); e sontu_private.event_instances; v sontu_private.event_versions; participant sontu_private.event_participants; is_host boolean;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into e from sontu_private.event_instances where id=event_hub.event_id;
  if not found or e.event_kind<>'SIMPLE' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  is_host:=e.host_owner_user_id=actor;
  if not is_host then
    select * into participant from sontu_private.event_participants p where p.event_instance_id=e.id and
      (p.participant_user_id=actor or (p.participant_user_id is null and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now()))
      order by (p.participant_user_id=actor) desc limit 1;
    if participant.id is null or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  end if;
  select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
  return jsonb_build_object('status','ready',
    'event',jsonb_build_object('id',e.id,'title',v.title,'description',v.description,'starts_at',v.starts_at,'ends_at',v.ends_at,'timezone',v.timezone,'venue_label',v.venue_label,'cover_key',v.cover_key,'capacity',v.capacity,'lifecycle',e.lifecycle,'current_version',e.current_version_number,'category',coalesce(e.event_category,'Event'),'format',coalesce(e.event_format,'in-person')),
    'viewer',jsonb_build_object('hosting',is_host,'display_name',participant.display_name,'commitment_state',participant.commitment_state,'invitation_state',participant.invitation_state),
    'host',(select jsonb_build_object('display_name',coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1))) from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id),
    'going',coalesce((select jsonb_agg(g order by g.sort_order,g.display_name) from (
      select 0 sort_order,coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) display_name,'Host'::text badge from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id
      union all select 1,coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)),case when m.public_visibility='PUBLIC_ROLE' then initcap(replace(m.role,'_',' ')) else 'Event team' end from sontu_private.event_team_members m join auth.users u on u.id=m.user_id left join sontu_private.account_profiles ap on ap.user_id=m.user_id where m.event_instance_id=e.id and m.attends_event and m.public_visibility<>'HIDDEN'
      union all select 2,p.display_name,null::text from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='CONFIRMED'
    ) g),'[]'::jsonb));
end $$;
