alter table sontu_private.event_versions
  add column if not exists protected_join_info text;

create or replace function sontu_private.valid_draft(input jsonb) returns boolean
language sql stable set search_path='' as $$
 select jsonb_typeof(input)='object'
 and length(coalesce(input->>'title',''))<=120 and length(coalesce(input->>'description',''))<=2000
 and length(coalesce(input->>'venue_label',''))<=300
 and length(coalesce(input->>'protected_join_info',''))<=1000
 and (
  coalesce(input->>'cover_key','') in ('food','music','market','yoga','sailing','sunset','none')
  or coalesce(input->>'cover_key','') ~ '^upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[-_.a-zA-Z0-9]+[.](jpg|jpeg|png|gif|webp)$'
 )
 and exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timezone')
 and (nullif(input->>'capacity','') is null or (
  input->>'capacity' ~ '^[0-9]+$'
  and (input->>'capacity')::numeric between 1 and 2147483647
 ))
 and (nullif(input->>'starts_at','') is null or isfinite((input->>'starts_at')::timestamptz))
 and (nullif(input->>'ends_at','') is null or isfinite((input->>'ends_at')::timestamptz))
 and (nullif(input->>'starts_at','') is null or nullif(input->>'ends_at','') is null or (input->>'starts_at')::timestamptz<(input->>'ends_at')::timestamptz)
$$;

revoke all on function sontu_private.valid_draft(jsonb) from public,anon,authenticated;

create or replace function public.sontu_event_join_info(
  action text,
  event_id uuid,
  value text default null,
  operation_id uuid default null,
  manage_token uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  e sontu_private.event_instances;
  v sontu_private.event_versions;
  p sontu_private.event_participants;
  can_view boolean := false;
  can_write boolean := false;
  cleaned text := nullif(trim(coalesce(value,'')), '');
  prior_operation sontu_private.operations;
  fingerprint text;
  result jsonb;
begin
  if action not in ('read','write') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into e from sontu_private.event_instances where id = sontu_event_join_info.event_id for update;
  if not found or e.event_kind <> 'SIMPLE' or e.lifecycle = 'DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into v from sontu_private.event_versions where event_instance_id = e.id and version_number = e.current_version_number;
  if actor is not null then
    can_write := sontu_private.can_manage_event_state(e.id, actor);
    select * into p from sontu_private.event_participants ep
      where ep.event_instance_id = e.id
        and ep.participant_user_id = actor
      limit 1;
    can_view := can_write or p.commitment_state = 'CONFIRMED';
  end if;
  if not can_view and manage_token is not null then
    select * into p from sontu_private.event_participants ep
      where ep.event_instance_id = e.id
        and ep.commitment_state = 'CONFIRMED'
        and (
          ep.token_hash = sha256(convert_to(manage_token::text,'UTF8'))
          or (
            ep.guest_recovery_token_hash = sha256(convert_to(manage_token::text,'UTF8'))
            and ep.guest_recovery_token_expires_at > now()
          )
        )
      limit 1;
    can_view := p.id is not null;
  end if;
  if action = 'read' then
    return jsonb_build_object(
      'status','ready',
      'join_info_visible',coalesce(can_view and v.protected_join_info is not null,false),
      'protected_join_info',case when can_view then v.protected_join_info else null end
    );
  end if;
  if not can_write then return sontu_private.fail('UNAUTHORIZED'); end if;
  if operation_id is null or length(coalesce(value,'')) > 1000 then return sontu_private.fail('INVALID_INPUT'); end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint := jsonb_build_object('action',action,'event_id',event_id,'value',cleaned)::text;
  select * into prior_operation from sontu_private.operations where id = operation_id;
  if found then
    if prior_operation.actor_ref <> actor::text or prior_operation.request_fingerprint <> fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior_operation.result;
  end if;
  update sontu_private.event_versions set protected_join_info = cleaned where id = v.id;
  result := jsonb_build_object('status','ready','event_id',e.id,'current_version',e.current_version_number,'join_info_visible',cleaned is not null,'protected_join_info',cleaned);
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'event_join_info',e.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
  values(e.id,operation_id,actor::text,'event_join_info',jsonb_build_object('version',e.current_version_number));
  return result;
end
$$;

revoke all on function public.sontu_event_join_info(text,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sontu_event_join_info(text,uuid,text,uuid,uuid) to anon,authenticated;
