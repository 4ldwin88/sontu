alter table sontu_private.account_profiles
  add column if not exists avatar_path text not null default '';

do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'profile-media',
      'profile-media',
      true,
      2097152,
      array['image/jpeg','image/png','image/gif','image/webp']
    )
    on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "Profile media public read" on storage.objects';
    execute 'drop policy if exists "Profile media own folder insert" on storage.objects';
    execute 'drop policy if exists "Profile media own folder update" on storage.objects';
    execute 'drop policy if exists "Profile media own folder delete" on storage.objects';

    execute 'create policy "Profile media public read" on storage.objects for select to anon, authenticated using (bucket_id = ''profile-media'')';
    execute 'create policy "Profile media own folder insert" on storage.objects for insert to authenticated with check (bucket_id = ''profile-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder update" on storage.objects for update to authenticated using (bucket_id = ''profile-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''profile-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder delete" on storage.objects for delete to authenticated using (bucket_id = ''profile-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
  end if;
end
$storage$;
create or replace function sontu_private.account_profile(action text, input jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p sontu_private.account_profiles;
  n text;
  h text;
  d text;
  stem text;
  attempt integer;
  event_mail boolean;
  profile_bio text;
  profile_bio_visibility text;
  profile_link_label text;
  profile_link_url text;
  profile_link_visibility text;
  profile_interests text[];
  profile_interests_visibility text;
  profile_avatar_path text;
begin
  if uid is null or not exists(select 1 from auth.users u where u.id = uid and not coalesce(u.is_anonymous, false)) then
    return jsonb_build_object('status', 'denied');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('profile:' || uid::text, 0));
  select * into p from sontu_private.account_profiles where user_id = uid for update;
  if action = 'read' then
    if p.user_id is null then return jsonb_build_object('status', 'empty'); end if;
  elsif action = 'create' then
    if p.user_id is null then
      n := btrim(input->>'first_name');
      if n is null or char_length(n) not between 1 and 80 then
        return jsonb_build_object('status', 'error', 'error_code', 'INVALID_NAME');
      end if;
      event_mail := coalesce((input->>'event_email_enabled')::boolean, true);
      stem := left(regexp_replace(lower(n), '[^a-z0-9]', '', 'g'), 20);
      if stem = '' then stem := 'member'; end if;
      for attempt in 1..10 loop
        h := stem || '_' || left(replace(gen_random_uuid()::text, '-', ''), 8);
        begin
          insert into sontu_private.account_profiles(user_id, first_name, handle, event_email_enabled)
            values(uid, n, h, event_mail)
            returning * into p;
          exit;
        exception when unique_violation then
          if attempt = 10 then raise; end if;
        end;
      end loop;
    end if;
  elsif action = 'update' then
    if p.user_id is null then return jsonb_build_object('status', 'empty'); end if;
    if (input->>'revision')::integer is distinct from p.revision then
      return jsonb_build_object('status', 'error', 'error_code', 'STALE_PROFILE');
    end if;
    n := btrim(input->>'first_name');
    d := btrim(coalesce(input->>'display_name', ''));
    h := lower(btrim(input->>'handle'));
    event_mail := coalesce((input->>'event_email_enabled')::boolean, p.event_email_enabled);
    profile_bio := btrim(coalesce(input->>'bio', p.bio));
    profile_bio_visibility := upper(btrim(coalesce(input->>'bio_visibility', p.bio_visibility)));
    profile_link_label := btrim(coalesce(input->>'link_label', p.link_label));
    profile_link_url := btrim(coalesce(input->>'link_url', p.link_url));
    profile_link_visibility := upper(btrim(coalesce(input->>'link_visibility', p.link_visibility)));
    profile_interests_visibility := upper(btrim(coalesce(input->>'interests_visibility', p.interests_visibility)));
    profile_avatar_path := btrim(coalesce(input->>'avatar_path', p.avatar_path));

    if input ? 'interests' then
      if jsonb_typeof(input->'interests') <> 'array' then
        return jsonb_build_object('status', 'error', 'error_code', 'INVALID_INTERESTS');
      end if;
      select coalesce(array_agg(interest), '{}'::text[]) into profile_interests
      from (
        select distinct btrim(value) as interest
        from jsonb_array_elements_text(input->'interests') as value
        where btrim(value) <> ''
      ) normalized;
    else
      profile_interests := p.interests;
    end if;

    if n is null or char_length(n) not between 1 and 80 or char_length(d) > 80 then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_NAME');
    end if;
    if char_length(profile_bio) > 240 or char_length(profile_link_label) > 80 or char_length(profile_link_url) > 240 then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_PROFILE_FIELD');
    end if;
    if coalesce(array_length(profile_interests, 1), 0) > 12 or exists(select 1 from unnest(profile_interests) as interest where char_length(interest) > 32) then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_INTERESTS');
    end if;
    if profile_bio_visibility not in ('GENERAL','CLOSE','ONLY_ME') or profile_link_visibility not in ('GENERAL','CLOSE','ONLY_ME') or profile_interests_visibility not in ('GENERAL','CLOSE','ONLY_ME') then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_VISIBILITY');
    end if;
    if profile_link_url <> '' and profile_link_url !~* '^https://[^[:space:]]+$' then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_LINK');
    end if;
    if profile_avatar_path <> '' and profile_avatar_path !~ ('^' || uid::text || '/[-_.a-zA-Z0-9]+[.](jpg|jpeg|png|gif|webp)$') then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_AVATAR');
    end if;
    if profile_link_url = '' then profile_link_label := ''; end if;
    if h is null or h !~ '^[a-z0-9][a-z0-9_.]{2,29}$' or exists(select 1 from sontu_private.reserved_handles r where r.handle = h) then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_HANDLE');
    end if;
    if h <> p.handle and not p.handle_provisional and p.handle_changed_at > now() - interval '30 days' then
      return jsonb_build_object('status', 'error', 'error_code', 'HANDLE_COOLDOWN');
    end if;
    begin
      update sontu_private.account_profiles
        set first_name = n,
            display_name = d,
            handle = h,
            avatar_path = profile_avatar_path,
            event_email_enabled = event_mail,
            bio = profile_bio,
            bio_visibility = profile_bio_visibility,
            link_label = profile_link_label,
            link_url = profile_link_url,
            link_visibility = profile_link_visibility,
            interests = profile_interests,
            interests_visibility = profile_interests_visibility,
            handle_provisional = case when h <> p.handle then false else p.handle_provisional end,
            handle_changed_at = case when h <> p.handle then now() else p.handle_changed_at end,
            revision = revision + 1
        where user_id = uid
        returning * into p;
    exception when unique_violation then
      return jsonb_build_object('status', 'error', 'error_code', 'HANDLE_UNAVAILABLE');
    end;
  else
    return jsonb_build_object('status', 'error', 'error_code', 'INVALID_ACTION');
  end if;
  return jsonb_build_object('status', 'ready', 'profile', to_jsonb(p));
end
$$;

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
      'avatar_path', profile_row.avatar_path,
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

revoke all on function sontu_private.account_profile(text,jsonb), sontu_private.public_profile_hub(text) from public, anon, authenticated;
grant execute on function sontu_private.account_profile(text,jsonb) to authenticated;
grant execute on function sontu_private.public_profile_hub(text) to anon, authenticated;

