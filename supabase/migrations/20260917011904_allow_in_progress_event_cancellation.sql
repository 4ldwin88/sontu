create or replace function sontu_private.cancel_event_command(
  event_id uuid,
  expected_version integer,
  operation_id uuid,
  input jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  event_row sontu_private.event_instances;
  prior sontu_private.operations;
  fingerprint text;
  result jsonb;
begin
  if actor is null or operation_id is null then
    return sontu_private.fail('UNAUTHORIZED');
  end if;

  select * into event_row
  from sontu_private.event_instances
  where id=cancel_event_command.event_id and host_owner_user_id=actor;
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;

  if event_row.lifecycle='PUBLISHED' then
    return sontu_private.host_command(
      'cancel',event_id,expected_version,operation_id,input
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'cmd','cancel','event',event_id,'version',expected_version,'input',input
  )::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;

  select * into event_row
  from sontu_private.event_instances
  where id=cancel_event_command.event_id and host_owner_user_id=actor
  for update;
  if event_row.current_version_number is distinct from expected_version then
    return sontu_private.fail('STALE_CONFLICT');
  end if;
  if event_row.lifecycle<>'IN_PROGRESS' then
    return sontu_private.fail('INVALID_STATE');
  end if;
  if input->>'confirmed' is distinct from 'true' then
    return sontu_private.fail('INVALID_CONFIRMATION');
  end if;

  update sontu_private.event_instances
  set lifecycle='CANCELLED',updated_at=now()
  where id=event_row.id;
  result:=jsonb_build_object(
    'status','ready','operation_id',operation_id,'event_id',event_row.id,
    'current_version',event_row.current_version_number
  );
  insert into sontu_private.operations(
    id,actor_ref,command_type,target_id,request_fingerprint,result
  ) values(operation_id,actor::text,'cancel',event_row.id,fingerprint,result);
  insert into sontu_private.audit_entries(
    event_instance_id,operation_id,actor_ref,audit_kind,metadata
  ) values(
    event_row.id,operation_id,actor::text,'cancel',
    jsonb_build_object(
      'expected_version',expected_version,
      'current_version',event_row.current_version_number,
      'confirmed',true,
      'from_lifecycle','IN_PROGRESS'
    )
  );
  return result;
end $$;

create or replace function public.sontu_host_command(
  cmd text,event_id uuid,expected_version integer,operation_id uuid,input jsonb
) returns jsonb
language sql security invoker set search_path='' as $$
  select case
    when cmd='cancel' then sontu_private.cancel_event_command(
      event_id,expected_version,operation_id,input
    )
    else sontu_private.host_command(cmd,event_id,expected_version,operation_id,input)
  end
$$;

revoke all on function sontu_private.cancel_event_command(uuid,integer,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function sontu_private.cancel_event_command(uuid,integer,uuid,jsonb)
  to authenticated;
