-- The delivery ledger intentionally has no creation timestamp. Do not invent
-- one for historic records; preserve only the provider-confirmed send time.
create or replace function sontu_private.participant_communication_history(event_id uuid, manage_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); participant sontu_private.event_participants;
begin
  if manage_token is not null then
    select * into participant from sontu_private.event_participants p
    where p.event_instance_id=participant_communication_history.event_id and p.participant_user_id is null
      and p.token_revoked_at is null and p.token_expires_at>now()
      and (p.token_hash=sha256(convert_to(manage_token::text,'UTF8')) or (p.guest_recovery_token_hash=sha256(convert_to(manage_token::text,'UTF8')) and p.guest_recovery_token_expires_at>now()));
  elsif actor is not null then
    select * into participant from sontu_private.event_participants p where p.event_instance_id=participant_communication_history.event_id and p.participant_user_id=actor;
  end if;
  if participant.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  return jsonb_build_object('status','ready','notices',coalesce((
    select jsonb_agg(jsonb_build_object('kind',c.kind,'state',case c.dispatch_state when 'DELIVERED' then 'DELIVERED' when 'SENT' then 'SENT' when 'PENDING' then 'PENDING' when 'PROCESSING' then 'PENDING' when 'FAILED_RETRYABLE' then 'RETRYING' when 'CONFIGURATION_UNAVAILABLE' then 'UNAVAILABLE' else 'UNAVAILABLE' end,'dispatched_at',case when c.dispatch_state in ('SENT','DELIVERED') then c.dispatched_at else null end) order by c.id desc)
    from sontu_private.communication_records c where c.event_instance_id=participant_communication_history.event_id and c.participant_id=participant.id
  ),'[]'::jsonb));
end $$;
