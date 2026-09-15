create or replace function sontu_private.public_profile_hub(handle_input text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_handle text := lower(btrim(coalesce(handle_input, '')));
  viewer uuid := auth.uid();
  profile_row sontu_private.account_profiles;
  selected_connection sontu_private.member_connections;
  close_viewer boolean := false;
  owner_viewer boolean := false;
  following_viewer boolean := false;
  viewer_connection_status text := 'none';
  fields jsonb := '{}'::jsonb;
  public_activity jsonb := '[]'::jsonb;
begin
  if normalized_handle !~ '^[a-z0-9][a-z0-9_.]{2,29}$' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into profile_row
    from sontu_private.account_profiles
    where handle = normalized_handle;

  if profile_row.user_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  owner_viewer := coalesce(viewer = profile_row.user_id, false);

  if viewer is not null and not owner_viewer then
    select exists(
      select 1
      from sontu_private.member_follows f
      where f.follower_user_id = viewer
        and f.followed_user_id = profile_row.user_id
    ) into following_viewer;

    select * into selected_connection
      from sontu_private.member_connections c
      where viewer in (c.requester_user_id, c.recipient_user_id)
        and profile_row.user_id in (c.requester_user_id, c.recipient_user_id)
      limit 1;

    if selected_connection.id is not null then
      if selected_connection.status = 'ACCEPTED' then
        viewer_connection_status := 'connected';
        close_viewer := (
          selected_connection.requester_user_id = profile_row.user_id
          and selected_connection.requester_marks_close
        ) or (
          selected_connection.recipient_user_id = profile_row.user_id
          and selected_connection.recipient_marks_close
        );
      elsif selected_connection.requester_user_id = viewer then
        viewer_connection_status := 'pending_sent';
      elsif selected_connection.recipient_user_id = viewer then
        viewer_connection_status := 'pending_received';
      end if;
    end if;
  end if;

  if profile_row.bio <> '' and (
    profile_row.bio_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.bio_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object('bio', profile_row.bio);
  end if;

  if profile_row.link_url <> '' and (
    profile_row.link_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.link_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object(
      'link', jsonb_build_object(
        'label', coalesce(nullif(profile_row.link_label, ''), profile_row.link_url),
        'url', profile_row.link_url
      )
    );
  end if;

  if cardinality(profile_row.interests) > 0 and (
    profile_row.interests_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.interests_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object('interests', to_jsonb(profile_row.interests));
  end if;

  select coalesce(jsonb_agg(activity order by activity->>'starts_at' nulls last), '[]'::jsonb)
    into public_activity
  from (
    select jsonb_build_object(
      'id', e.id,
      'relationship', 'host',
      'title', v.title,
      'starts_at', v.starts_at,
      'timezone', v.timezone,
      'venue_label', v.venue_label,
      'cover_key', v.cover_key,
      'category', coalesce(e.event_category, 'Event'),
      'format', coalesce(e.event_format, 'in-person'),
      'lifecycle', e.lifecycle
    ) as activity
    from sontu_private.event_instances e
    join sontu_private.event_versions v
      on v.event_instance_id = e.id
     and v.version_number = e.current_version_number
    where e.host_owner_user_id = profile_row.user_id
      and e.event_kind = 'SIMPLE'
      and e.visibility = 'PUBLIC'
      and e.lifecycle in ('PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED')
    order by v.starts_at nulls last, e.id
    limit 6
  ) hosted;

  return jsonb_build_object(
    'status', 'ready',
    'viewer', jsonb_build_object(
      'owner', owner_viewer,
      'close', close_viewer,
      'following', following_viewer,
      'connection_status', viewer_connection_status
    ),
    'profile', jsonb_build_object(
      'display_name', coalesce(nullif(profile_row.display_name, ''), profile_row.first_name),
      'handle', profile_row.handle,
      'fields', fields,
      'counts', jsonb_build_object(
        'followers', (select count(*) from sontu_private.member_follows f where f.followed_user_id = profile_row.user_id),
        'following', (select count(*) from sontu_private.member_follows f where f.follower_user_id = profile_row.user_id)
      ),
      'activity', public_activity
    )
  );
end
$$;

revoke all on function sontu_private.public_profile_hub(text) from public, anon, authenticated;
grant execute on function sontu_private.public_profile_hub(text) to anon, authenticated;
