create or replace function sontu_private.public_event_participation(event_id uuid, action text default 'READ', expected_version integer default null, operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  mail text:=sontu_private.verified_email();
  event_row sontu_private.event_instances;
  version_row sontu_private.event_versions;
  participant sontu_private.event_participants;
  prior_operation sontu_private.operations;
  reserved integer;
  total_going integer;
  display text;
  fingerprint text;
  result jsonb;
  is_host boolean:=false;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if mail is null then return sontu_private.fail('VERIFY_EMAIL'); end if;
  if action not in ('READ','JOIN','WITHDRAW') or (action<>'READ' and operation_id is null) then return sontu_private.fail('INVALID_INPUT'); end if;
  if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;
  fingerprint:=jsonb_build_object('actor',actor,'event_id',event_id,'action',action,'version',expected_version)::text;
  if action<>'READ' then
    select * into prior_operation from sontu_private.operations where id=operation_id;
    if found then
      if prior_operation.actor_ref<>actor::text or prior_operation.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
      return prior_operation.result;
    end if;
  end if;
  select * into event_row from sontu_private.event_instances where id=public_event_participation.event_id and event_kind='SIMPLE' and visibility in ('PUBLIC','UNLISTED') for update;
  if not found or event_row.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  is_host:=event_row.host_owner_user_id=actor;
  select * into version_row from sontu_private.event_versions where event_instance_id=event_row.id and version_number=event_row.current_version_number;
  select * into participant from sontu_private.event_participants p where p.event_instance_id=event_row.id and (p.participant_user_id=actor or lower(p.invitation_email)=mail) order by (p.participant_user_id=actor) desc limit 1;
  reserved:=sontu_private.reserved_party_places(event_row.id);
  select reserved+1+count(*) into total_going from sontu_private.event_team_members m where m.event_instance_id=event_row.id and m.attends_event;
  if action='READ' then
    return jsonb_build_object(
      'status','ready',
      'hosting',is_host,
      'commitment_state',participant.commitment_state,
      'current_version',event_row.current_version_number,
      'participant_count',reserved,
      'going_count',total_going,
      'capacity',version_row.capacity,
      'full',version_row.capacity is not null and reserved>=version_row.capacity,
      'responses_open',event_row.lifecycle='PUBLISHED' and version_row.starts_at>now() and not is_host
    );
  end if;
  if expected_version is distinct from event_row.current_version_number or event_row.lifecycle<>'PUBLISHED' or version_row.starts_at<=now() or is_host then return sontu_private.fail('INVALID_STATE'); end if;
  if action='JOIN' then
    if participant.id is not null and participant.commitment_state='CONFIRMED' then
      result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
    else
      if version_row.capacity is not null and reserved+1>version_row.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      select coalesce(nullif(p.display_name,''),p.first_name,split_part(mail,'@',1)) into display from sontu_private.account_profiles p where p.user_id=actor;
      display:=coalesce(display,split_part(mail,'@',1));
      if participant.id is null then
        insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,invitation_state,participant_user_id) values(event_row.id,display,'CONFIRMED',mail,null,actor) returning * into participant;
      else
        update sontu_private.event_participants set participant_user_id=actor,display_name=display,commitment_state='CONFIRMED',invitation_state=case when invitation_state is null then null else 'ACCEPTED' end where id=participant.id returning * into participant;
      end if;
      result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
    end if;
  else
    if participant.id is null or participant.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;
    update sontu_private.event_participants set commitment_state='RELEASED_DECLINED',plus_one_allowance=0 where id=participant.id;
    result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
  end if;
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result) values(operation_id,actor::text,lower(action)||'_public_event',event_row.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_row.id,operation_id,actor::text,lower(action)||'_public_event',jsonb_build_object('version',event_row.current_version_number,'participant_id',participant.id));
  return result;
end $$;

revoke all on function sontu_private.public_event_participation(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function sontu_private.public_event_participation(uuid,text,integer,uuid) to authenticated;
