-- A short-lived guest recovery credential provides the same private admission
-- view as the original guest RSVP credential; neither can reveal other guests.
create or replace function sontu_private.participant_admission_projection(event_id uuid, manage_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); participant sontu_private.event_participants; admission sontu_private.event_admissions; credential sontu_private.event_credentials; digest bytea:=sha256(convert_to(manage_token::text,'UTF8'));
begin
  if manage_token is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id
        and p.participant_user_id is null and p.token_revoked_at is null and p.token_expires_at>now()
        and (p.token_hash=digest or (p.guest_recovery_token_hash=digest and p.guest_recovery_token_expires_at>now()));
  elsif actor is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id and p.participant_user_id=actor;
  end if;
  if participant.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into admission from sontu_private.event_admissions a where a.event_participant_id=participant.id;
  select * into credential from sontu_private.event_credentials c where c.admission_id=admission.id order by c.created_at desc limit 1;
  return jsonb_build_object('status','ready','admission',jsonb_build_object(
    'status',coalesce(admission.status,'PENDING'),'issued_at',admission.issued_at,
    'invalidated_at',admission.invalidated_at,'can_enter',admission.status='VALID',
    'credential_status',coalesce(credential.status,'NOT_ISSUED'),
    'credential_expires_at',credential.expires_at,
    'credential_reference',case when credential.status='ACTIVE' then credential.id::text else null end));
end $$;
revoke all on function sontu_private.participant_admission_projection(uuid,uuid) from public,anon,authenticated;
