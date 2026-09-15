-- Narrow host-only credential counts; no credential references or bearer data.
create function sontu_private.host_credential_lifecycle_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from sontu_private.event_instances e
    where e.id=event_id and e.host_owner_user_id=auth.uid()
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','counts',jsonb_build_object(
    'active',(select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_instance_id=event_id and c.status='ACTIVE'),
    'revoked',(select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_instance_id=event_id and c.status='REVOKED'),
    'expired',(select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_instance_id=event_id and c.status='EXPIRED')));
end $$;
create function public.sontu_host_credential_lifecycle_projection(event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.host_credential_lifecycle_projection(event_id) $$;
revoke all on function sontu_private.host_credential_lifecycle_projection(uuid),public.sontu_host_credential_lifecycle_projection(uuid) from public,anon,authenticated;
grant execute on function public.sontu_host_credential_lifecycle_projection(uuid) to authenticated;
