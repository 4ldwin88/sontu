create or replace function sontu_private.delete_event_draft(event_id uuid, operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  prior sontu_private.operations;
  locked_event_id uuid;
  fingerprint text;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if event_id is null or operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  fingerprint := encode(sha256(convert_to(jsonb_build_object('cmd','delete_draft','event',event_id)::text, 'UTF8')), 'hex');
  select * into prior from sontu_private.operations where id = operation_id;
  if found then
    if prior.actor_ref <> actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint <> fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;

  select e.id into locked_event_id
  from sontu_private.event_instances e
  where e.id = event_id and e.host_owner_user_id = actor and e.lifecycle = 'DRAFT'
  for update;
  if locked_event_id is null then
    return sontu_private.fail('DRAFT_NOT_FOUND');
  end if;

  -- Draft creation adds only its initial version, owner participant and audit trail.
  -- Refuse deletion if the event has already gained consequential coordination data.
  if exists (select 1 from sontu_private.material_changes where event_instance_id = event_id)
    or exists (select 1 from sontu_private.consequence_cases where event_instance_id = event_id)
    or exists (select 1 from sontu_private.communication_records where event_instance_id = event_id)
    or exists (select 1 from sontu_private.evidence_records where event_instance_id = event_id)
    or exists (select 1 from sontu_private.outbox_entries where event_instance_id = event_id)
  then
    return sontu_private.fail('DRAFT_HAS_ACTIVITY');
  end if;

  delete from sontu_private.audit_entries where event_instance_id = event_id;
  delete from sontu_private.event_participants where event_instance_id = event_id;
  delete from sontu_private.event_versions where event_instance_id = event_id;
  delete from sontu_private.event_instances where id = event_id;

  result := jsonb_build_object('status','ready','deleted',true,'event_id',event_id);
  insert into sontu_private.operations(id, actor_ref, command_type, target_id, request_fingerprint, result)
  values(operation_id, actor::text, 'delete_draft', event_id, fingerprint, result);
  return result;
end
$$;

create or replace function public.sontu_delete_event_draft(event_id uuid, operation_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select sontu_private.delete_event_draft(event_id, operation_id) $$;

revoke all on function sontu_private.delete_event_draft(uuid,uuid) from public, anon, authenticated;
revoke all on function public.sontu_delete_event_draft(uuid,uuid) from public, anon, authenticated;
grant execute on function sontu_private.delete_event_draft(uuid,uuid) to authenticated;
grant execute on function public.sontu_delete_event_draft(uuid,uuid) to authenticated;
