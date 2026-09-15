-- Every value is derived from an authoritative operational record. This
-- projection deliberately excludes views, reach, conversion, and revenue.
create function sontu_private.host_operational_analytics(event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e sontu_private.event_instances; v sontu_private.event_versions;
begin
  if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into e from sontu_private.event_instances
    where id=host_operational_analytics.event_id and host_owner_user_id=auth.uid();
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into v from sontu_private.event_versions
    where event_instance_id=e.id and version_number=e.current_version_number;
  return jsonb_build_object(
    'status','ready','event_id',e.id,'lifecycle',e.lifecycle,'capacity',v.capacity,
    'rsvp',jsonb_build_object(
      'confirmed',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='CONFIRMED'),
      'awaiting',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='NO_COMMITMENT' and coalesce(p.invitation_state,'CREATED')='CREATED'),
      'declined_or_withdrawn',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and (p.commitment_state='RELEASED_DECLINED' or p.invitation_state='DECLINED'))),
    'invitations',jsonb_build_object(
      'created',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.invitation_state is not null),
      'accepted',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.invitation_state='ACCEPTED'),
      'declined',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.invitation_state='DECLINED'),
      'active_links',(select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.token_hash is not null and p.token_revoked_at is null and p.token_expires_at>now())),
    'delivery',jsonb_build_object(
      'pending',(select count(*) from sontu_private.communication_records c where c.event_instance_id=e.id and c.dispatch_state in ('PENDING','PROCESSING')),
      'sent',(select count(*) from sontu_private.communication_records c where c.event_instance_id=e.id and c.dispatch_state in ('SENT','DELIVERED')),
      'failed',(select count(*) from sontu_private.communication_records c where c.event_instance_id=e.id and c.dispatch_state in ('FAILED','FAILED_RETRYABLE','FAILED_PERMANENT','CONFIGURATION_UNAVAILABLE'))),
    'admissions',jsonb_build_object(
      'valid',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status='VALID'),
      'used',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status='USED'),
      'invalid',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status in ('REVOKED','CANCELLED_EVENT_INVALID','REFUNDED_INVALID','EXPIRED')),
      'pending',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status='PENDING')),
    'check_in',jsonb_build_object(
      'checked_in',(select count(*) from sontu_private.event_check_ins c where c.event_instance_id=e.id)));
end $$;

create function public.sontu_host_operational_analytics(event_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select sontu_private.host_operational_analytics(event_id)
$$;
revoke all on function sontu_private.host_operational_analytics(uuid),public.sontu_host_operational_analytics(uuid) from public,anon,authenticated;
grant execute on function public.sontu_host_operational_analytics(uuid) to authenticated;
