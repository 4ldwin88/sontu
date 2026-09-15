-- Cosmetic cover replacement for an authorized event host. The image upload
-- branch remains intentionally deferred; cover_key references approved stock art.
create function sontu_private.change_event_cover(
  event_id uuid,
  expected_version integer,
  cover_key text,
  operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  event_row sontu_private.event_instances;
  prior sontu_private.event_versions;
  fingerprint text;
  prior_operation sontu_private.operations;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if operation_id is null or cover_key not in ('food','music','market','yoga','sailing','sunset') then
    return sontu_private.fail('INVALID_INPUT');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'event_id',event_id,'expected_version',expected_version,'cover_key',cover_key
  )::text,'UTF8')),'hex');
  select * into prior_operation from sontu_private.operations where id=operation_id;
  if found then
    if prior_operation.actor_ref<>actor::text or prior_operation.request_fingerprint<>fingerprint then
      return sontu_private.fail('IDEMPOTENCY_MISMATCH');
    end if;
    return prior_operation.result;
  end if;

  select * into event_row from sontu_private.event_instances
  where id=change_event_cover.event_id and host_owner_user_id=actor for update;
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  if event_row.event_kind<>'SIMPLE' or event_row.lifecycle not in ('DRAFT','PUBLISHED') then
    return sontu_private.fail('INVALID_STATE');
  end if;
  if expected_version is distinct from event_row.current_version_number then
    return sontu_private.fail('STALE_CONFLICT');
  end if;
  select * into prior from sontu_private.event_versions
  where event_instance_id=event_row.id and version_number=event_row.current_version_number;
  if prior.cover_key=change_event_cover.cover_key then return sontu_private.fail('INVALID_INPUT'); end if;

  insert into sontu_private.event_versions(
    event_instance_id,version_number,prior_version_id,title,description,starts_at,ends_at,
    timezone,venue_label,cover_key,capacity,materiality_class,created_by
  ) values (
    event_row.id,event_row.current_version_number+1,prior.id,prior.title,prior.description,
    prior.starts_at,prior.ends_at,prior.timezone,prior.venue_label,change_event_cover.cover_key,
    prior.capacity,'COSMETIC',actor
  );
  update sontu_private.event_instances set current_version_number=current_version_number+1,updated_at=now()
  where id=event_row.id returning * into event_row;

  result:=jsonb_build_object('status','ready','operation_id',operation_id,'event_id',event_row.id,'current_version',event_row.current_version_number);
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'change_cover',event_row.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
  values(event_row.id,operation_id,actor::text,'change_cover',jsonb_build_object('expected_version',expected_version,'current_version',event_row.current_version_number));
  return result;
end $$;

create function public.sontu_change_event_cover(event_id uuid,expected_version integer,cover_key text,operation_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.change_event_cover(event_id,expected_version,cover_key,operation_id) $$;

revoke all on function sontu_private.change_event_cover(uuid,integer,text,uuid),public.sontu_change_event_cover(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function sontu_private.change_event_cover(uuid,integer,text,uuid),public.sontu_change_event_cover(uuid,integer,text,uuid) to authenticated;
