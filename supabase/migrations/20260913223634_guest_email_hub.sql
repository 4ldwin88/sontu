-- A public event is discoverable by default and, unless a host deliberately
-- restricts it, can accept a name-and-email guest RSVP.
alter table sontu_private.event_instances
  alter column participation_access set default 'ANYONE';

-- This function is callable only by the delivery worker. Possession of the
-- current guest credential is required; the raw credential is never stored.
create function sontu_private.claim_guest_rsvp_email(event_id uuid, manage_token uuid)
returns table(outbox_id uuid, recipient_email text, recipient_name text, event_title text, starts_at timestamptz, timezone text, venue_label text)
language plpgsql security definer set search_path=''
as $$
begin
  return query
  with candidate as (
    select o.id
    from sontu_private.outbox_entries o
    join sontu_private.communication_records c on c.id=o.communication_id
    join sontu_private.event_participants p on p.id=c.participant_id
    join sontu_private.event_instances e on e.id=c.event_instance_id
    where c.event_instance_id=claim_guest_rsvp_email.event_id
      and c.kind='GUEST_RSVP_CONFIRMATION'
      and p.token_hash=sha256(convert_to(claim_guest_rsvp_email.manage_token::text,'UTF8'))
      and p.participant_user_id is null
      and p.commitment_state='CONFIRMED'
      and p.token_revoked_at is null
      and p.token_expires_at>now()
      and e.event_kind='SIMPLE'
      and o.state in ('PENDING','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE')
    for update of o skip locked
    limit 1
  ), claimed as (
    update sontu_private.outbox_entries o
    set state='PROCESSING',claimed_at=now(),attempt_count=o.attempt_count+1
    from candidate where o.id=candidate.id
    returning o.id,o.communication_id
  )
  select o.id,p.invitation_email,p.display_name,v.title,v.starts_at,v.timezone,v.venue_label
  from claimed x
  join sontu_private.outbox_entries o on o.id=x.id
  join sontu_private.communication_records c on c.id=x.communication_id
  join sontu_private.event_participants p on p.id=c.participant_id
  join sontu_private.event_instances e on e.id=c.event_instance_id
  join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number;
end $$;

create function public.sontu_claim_guest_rsvp_email(event_id uuid, manage_token uuid)
returns table(outbox_id uuid, recipient_email text, recipient_name text, event_title text, starts_at timestamptz, timezone text, venue_label text)
language sql security invoker set search_path=''
as $$ select * from sontu_private.claim_guest_rsvp_email(event_id,manage_token) $$;
revoke all on function sontu_private.claim_guest_rsvp_email(uuid,uuid),public.sontu_claim_guest_rsvp_email(uuid,uuid) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
    grant execute on function public.sontu_claim_guest_rsvp_email(uuid,uuid) to service_role;
  end if;
end $$;
