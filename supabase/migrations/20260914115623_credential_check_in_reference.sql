-- A credential id is an opaque presentation reference, never the authority:
-- the existing server-side check-in command still resolves lifecycle,
-- operator permission, admission validity and duplicate use.
create function sontu_private.check_in_credential_command(
  event_id uuid, credential_id uuid, operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare participant_id uuid;
begin
  if credential_id is null then
    return jsonb_build_object('status','error','error_code','INVALID_CREDENTIAL','result','INVALID');
  end if;
  select a.event_participant_id into participant_id
  from sontu_private.event_credentials c
  join sontu_private.event_admissions a on a.id=c.admission_id
  where c.id=credential_id;
  if participant_id is null then
    return jsonb_build_object('status','error','error_code','INVALID_CREDENTIAL','result','INVALID');
  end if;
  return sontu_private.check_in_command(event_id,participant_id,operation_id);
end $$;

create function public.sontu_check_in_credential_command(
  event_id uuid, credential_id uuid, operation_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select sontu_private.check_in_credential_command(event_id,credential_id,operation_id)
$$;

revoke all on function sontu_private.check_in_credential_command(uuid,uuid,uuid),
  public.sontu_check_in_credential_command(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sontu_check_in_credential_command(uuid,uuid,uuid) to authenticated;
