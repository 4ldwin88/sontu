-- Extend the existing authorized projection; preserve its owner/recipient access predicate.
create or replace function sontu_private.my_events() returns jsonb language plpgsql security definer set search_path='' as $$
declare mail text:=sontu_private.verified_email();
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(x order by x.starts_at nulls last,x.id) from (
  select e.id,e.lifecycle,v.title,v.description,v.starts_at,v.ends_at,v.timezone,v.venue_label,v.cover_key,
   e.host_owner_user_id=auth.uid() as hosting,p.commitment_state,p.invitation_state
  from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  left join sontu_private.event_participants p on p.event_instance_id=e.id and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now()
  where e.event_kind='SIMPLE' and (e.host_owner_user_id=auth.uid() or (p.id is not null and e.lifecycle<>'DRAFT'))
 ) x),'[]'));
end $$;
