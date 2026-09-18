create or replace function sontu_private.public_events(event_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status','ready','events',coalesce(jsonb_agg(x order by x.starts_at nulls last,x.id),'[]'::jsonb))
  from (
    select e.id,e.lifecycle,e.current_version_number as current_version,e.event_category as category,e.event_format as format,e.visibility,e.participation_access,
      v.title,v.description,v.starts_at,v.ends_at,v.timezone,v.venue_label,v.cover_key,v.capacity,
      false as hosting,null::text as commitment_state,null::text as invitation_state,
      exists(select 1 from sontu_private.event_interests i where i.event_instance_id=e.id and i.user_id=auth.uid()) as interested,
      (sontu_private.reserved_party_places(e.id) + (select count(*) from sontu_private.event_team_members m where m.event_instance_id=e.id and m.attends_event) + 1)::int as going_count,
      (select coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id) as host_name,
      (select ap.handle from sontu_private.account_profiles ap where ap.user_id=e.host_owner_user_id) as host_handle,
      (select ap.avatar_path from sontu_private.account_profiles ap where ap.user_id=e.host_owner_user_id) as host_avatar_path
    from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
    where e.event_kind='SIMPLE' and e.lifecycle in ('PUBLISHED','IN_PROGRESS','CANCELLED','COMPLETED')
      and (
        public_events.event_id is not null
        or v.ends_at is null
        or v.ends_at > now()
      )
      and (e.visibility='PUBLIC' or (public_events.event_id is not null and e.visibility='UNLISTED' and e.id=public_events.event_id))
      and (public_events.event_id is null or e.id=public_events.event_id)
  ) x
$$;

revoke all on function sontu_private.public_events(uuid) from public, anon, authenticated;
grant execute on function sontu_private.public_events(uuid) to anon, authenticated;
