-- A credential is a private event entitlement, not a public ticket lookup.
create function sontu_private.participant_admission_projection(event_id uuid, manage_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); participant sontu_private.event_participants; admission sontu_private.event_admissions;
begin
  if manage_token is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id
        and p.token_hash=sha256(convert_to(manage_token::text,'UTF8'))
        and p.participant_user_id is null and p.token_revoked_at is null and p.token_expires_at>now();
  elsif actor is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id and p.participant_user_id=actor;
  end if;
  if participant.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into admission from sontu_private.event_admissions a where a.event_participant_id=participant.id;
  return jsonb_build_object('status','ready','admission',jsonb_build_object(
    'status',coalesce(admission.status,'PENDING'),'issued_at',admission.issued_at,
    'invalidated_at',admission.invalidated_at,'can_enter',admission.status='VALID'));
end $$;
create function public.sontu_participant_admission_projection(event_id uuid, manage_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select sontu_private.participant_admission_projection(event_id,manage_token)
$$;
revoke all on function sontu_private.participant_admission_projection(uuid,uuid),public.sontu_participant_admission_projection(uuid,uuid) from public;
grant execute on function public.sontu_participant_admission_projection(uuid,uuid) to anon,authenticated;
