-- Keep the host surface contextual: the personal event owner retains ultimate
-- authority, while only the two event-scoped management roles may see the
-- aggregate operational/admission state. Check-in staff remain purpose-bound
-- to the door surface and never receive the host dashboard by implication.
create function sontu_private.can_manage_event_state(event_id uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sontu_private.event_instances e
    where e.id = can_manage_event_state.event_id
      and e.host_owner_user_id = can_manage_event_state.actor
  )
  or exists (
    select 1
    from sontu_private.event_team_members m
    where m.event_instance_id = can_manage_event_state.event_id
      and m.user_id = can_manage_event_state.actor
      and m.role in ('CO_HOST', 'EVENT_MANAGER')
  )
$$;

revoke all on function sontu_private.can_manage_event_state(uuid, uuid)
  from public, anon, authenticated;

create or replace function sontu_private.host_credential_lifecycle_projection(event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not sontu_private.can_manage_event_state(event_id, auth.uid()) then
    return sontu_private.fail('UNAUTHORIZED');
  end if;

  return jsonb_build_object('status', 'ready', 'counts', jsonb_build_object(
    'active', (select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id = c.admission_id where a.event_instance_id = event_id and c.status = 'ACTIVE'),
    'revoked', (select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id = c.admission_id where a.event_instance_id = event_id and c.status = 'REVOKED'),
    'expired', (select count(*) from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id = c.admission_id where a.event_instance_id = event_id and c.status = 'EXPIRED')
  ));
end
$$;

create or replace function sontu_private.host_operational_analytics(event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e sontu_private.event_instances;
  v sontu_private.event_versions;
  reserved integer;
begin
  if auth.uid() is null
    or not sontu_private.can_manage_event_state(event_id, auth.uid()) then
    return sontu_private.fail('UNAUTHORIZED');
  end if;

  select * into e
  from sontu_private.event_instances
  where id = host_operational_analytics.event_id;
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;

  select * into v from sontu_private.event_versions
  where event_instance_id = e.id and version_number = e.current_version_number;
  reserved := sontu_private.reserved_party_places(e.id);

  return jsonb_build_object('status', 'ready', 'event_id', e.id, 'lifecycle', e.lifecycle, 'capacity', v.capacity,
    'rsvp', jsonb_build_object(
      'confirmed', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.commitment_state = 'CONFIRMED'),
      'reserved_places', reserved, 'remaining_places', case when v.capacity is null then null else greatest(v.capacity - reserved, 0) end,
      'awaiting', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.commitment_state = 'NO_COMMITMENT' and coalesce(p.invitation_state, 'CREATED') = 'CREATED'),
      'declined_or_withdrawn', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and (p.commitment_state = 'RELEASED_DECLINED' or p.invitation_state = 'DECLINED'))),
    'invitations', jsonb_build_object(
      'created', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.invitation_state is not null),
      'accepted', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.invitation_state = 'ACCEPTED'),
      'declined', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.invitation_state = 'DECLINED'),
      'active_links', (select count(*) from sontu_private.event_participants p where p.event_instance_id = e.id and p.token_hash is not null and p.token_revoked_at is null and p.token_expires_at > now())),
    'delivery', jsonb_build_object(
      'pending', (select count(*) from sontu_private.communication_records c where c.event_instance_id = e.id and c.dispatch_state in ('PENDING', 'PROCESSING')),
      'sent', (select count(*) from sontu_private.communication_records c where c.event_instance_id = e.id and c.dispatch_state in ('SENT', 'DELIVERED')),
      'failed', (select count(*) from sontu_private.communication_records c where c.event_instance_id = e.id and c.dispatch_state in ('FAILED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CONFIGURATION_UNAVAILABLE'))),
    'admissions', jsonb_build_object(
      'valid', (select count(*) from sontu_private.event_admissions a where a.event_instance_id = e.id and a.status = 'VALID'),
      'used', (select count(*) from sontu_private.event_admissions a where a.event_instance_id = e.id and a.status = 'USED'),
      'invalid', (select count(*) from sontu_private.event_admissions a where a.event_instance_id = e.id and a.status in ('REVOKED', 'CANCELLED_EVENT_INVALID', 'REFUNDED_INVALID', 'EXPIRED')),
      'pending', (select count(*) from sontu_private.event_admissions a where a.event_instance_id = e.id and a.status = 'PENDING')),
    'check_in', jsonb_build_object('checked_in', (select count(*) from sontu_private.event_check_ins c where c.event_instance_id = e.id))
  );
end
$$;

revoke all on function sontu_private.host_credential_lifecycle_projection(uuid),
  sontu_private.host_operational_analytics(uuid)
from public, anon, authenticated;
