create table if not exists sontu_private.member_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

alter table sontu_private.member_follows enable row level security;
revoke all on sontu_private.member_follows from anon, authenticated;

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
      )
    )
  );
end
$$;

create or replace function sontu_private.connections(action text, input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target uuid;
  selected_context_id uuid;
  n text;
  selected_connection sontu_private.member_connections;
  mark_close boolean;
begin
  if uid is null or not exists(select 1 from auth.users u where u.id = uid and not coalesce(u.is_anonymous, false)) then
    return jsonb_build_object('status', 'denied');
  end if;

  if action = 'read' then
    return jsonb_build_object(
      'status', 'ready',
      'connections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'status', c.status,
          'direction', case when c.requester_user_id = uid then 'OUTGOING' else 'INCOMING' end,
          'user_id', p.user_id,
          'display_name', coalesce(nullif(p.display_name, ''), p.first_name),
          'handle', p.handle,
          'is_close', case when c.requester_user_id = uid then c.requester_marks_close else c.recipient_marks_close end
        ) order by coalesce(nullif(p.display_name, ''), p.first_name))
        from sontu_private.member_connections c
        join sontu_private.account_profiles p
          on p.user_id = case when c.requester_user_id = uid then c.recipient_user_id else c.requester_user_id end
        where uid in (c.requester_user_id, c.recipient_user_id)
      ), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'requester_user_id', p.user_id,
          'display_name', coalesce(nullif(p.display_name, ''), p.first_name),
          'handle', p.handle,
          'created_at', c.created_at
        ) order by c.created_at desc)
        from sontu_private.member_connections c
        join sontu_private.account_profiles p on p.user_id = c.requester_user_id
        where c.recipient_user_id = uid and c.status = 'PENDING'
      ), '[]'::jsonb),
      'followers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', p.user_id,
          'display_name', coalesce(nullif(p.display_name, ''), p.first_name),
          'handle', p.handle
        ) order by f.created_at desc)
        from sontu_private.member_follows f
        join sontu_private.account_profiles p on p.user_id = f.follower_user_id
        where f.followed_user_id = uid
      ), '[]'::jsonb),
      'following', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', p.user_id,
          'display_name', coalesce(nullif(p.display_name, ''), p.first_name),
          'handle', p.handle
        ) order by f.created_at desc)
        from sontu_private.member_follows f
        join sontu_private.account_profiles p on p.user_id = f.followed_user_id
        where f.follower_user_id = uid
      ), '[]'::jsonb),
      'contexts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id,
          'name', x.name,
          'members', coalesce((
            select jsonb_agg(jsonb_build_object(
              'user_id', p.user_id,
              'display_name', coalesce(nullif(p.display_name, ''), p.first_name),
              'handle', p.handle
            ) order by coalesce(nullif(p.display_name, ''), p.first_name))
            from sontu_private.connection_context_members m
            join sontu_private.account_profiles p on p.user_id = m.member_user_id
            where m.context_id = x.id
          ), '[]'::jsonb)
        ) order by x.name)
        from sontu_private.connection_contexts x
        where x.owner_user_id = uid
      ), '[]'::jsonb)
    );
  elsif action in ('follow', 'unfollow') then
    select p.user_id into target from sontu_private.account_profiles p where p.handle = lower(btrim(input->>'handle'));
    if target is null then return jsonb_build_object('status', 'error', 'error_code', 'MEMBER_NOT_FOUND'); end if;
    if target = uid then return jsonb_build_object('status', 'error', 'error_code', 'SELF_FOLLOW'); end if;
    if action = 'follow' then
      insert into sontu_private.member_follows(follower_user_id, followed_user_id)
        values(uid, target)
        on conflict do nothing;
      return jsonb_build_object('status', 'ready', 'following', true);
    end if;
    delete from sontu_private.member_follows f
      where f.follower_user_id = uid
        and f.followed_user_id = target;
    return jsonb_build_object('status', 'ready', 'following', false);
  elsif action = 'set_close' then
    mark_close := coalesce((input->>'is_close')::boolean, false);
    update sontu_private.member_connections
      set requester_marks_close = case when requester_user_id = uid then mark_close else requester_marks_close end,
          recipient_marks_close = case when recipient_user_id = uid then mark_close else recipient_marks_close end
      where id = (input->>'connection_id')::uuid
        and uid in (requester_user_id, recipient_user_id)
        and status = 'ACCEPTED'
      returning * into selected_connection;
    if selected_connection.id is null then
      return jsonb_build_object('status', 'error', 'error_code', 'CONNECTION_NOT_FOUND');
    end if;
    return jsonb_build_object('status', 'ready');
  elsif action = 'request' then
    select p.user_id into target from sontu_private.account_profiles p where p.handle = lower(btrim(input->>'handle'));
    if target is null then return jsonb_build_object('status', 'error', 'error_code', 'MEMBER_NOT_FOUND'); end if;
    if target = uid then return jsonb_build_object('status', 'error', 'error_code', 'SELF_CONNECTION'); end if;
    select * into selected_connection from sontu_private.member_connections c
      where least(c.requester_user_id, c.recipient_user_id) = least(uid, target)
        and greatest(c.requester_user_id, c.recipient_user_id) = greatest(uid, target)
      limit 1;
    if selected_connection.id is not null then
      return jsonb_build_object('status', 'ready', 'connection_id', selected_connection.id, 'connection_status', selected_connection.status);
    end if;
    insert into sontu_private.member_connections(requester_user_id, recipient_user_id, status)
      values(uid, target, 'PENDING')
      returning * into selected_connection;
    return jsonb_build_object('status', 'ready', 'connection_id', selected_connection.id, 'connection_status', selected_connection.status);
  elsif action = 'accept' then
    update sontu_private.member_connections set status = 'ACCEPTED', accepted_at = now()
      where id = (input->>'connection_id')::uuid and recipient_user_id = uid and status = 'PENDING'
      returning * into selected_connection;
    if selected_connection.id is null then return jsonb_build_object('status', 'error', 'error_code', 'REQUEST_NOT_FOUND'); end if;
    return jsonb_build_object('status', 'ready');
  elsif action = 'deny' then
    delete from sontu_private.member_connections
      where id = (input->>'connection_id')::uuid and recipient_user_id = uid and status = 'PENDING'
      returning * into selected_connection;
    if selected_connection.id is null then return jsonb_build_object('status', 'error', 'error_code', 'REQUEST_NOT_FOUND'); end if;
    return jsonb_build_object('status', 'ready');
  elsif action = 'remove' then
    delete from sontu_private.member_connections where id = (input->>'connection_id')::uuid and uid in (requester_user_id, recipient_user_id);
    return jsonb_build_object('status', 'ready');
  elsif action = 'create_context' then
    n := btrim(input->>'name');
    if n is null or char_length(n) not between 1 and 80 then return jsonb_build_object('status', 'error', 'error_code', 'INVALID_CONTEXT'); end if;
    insert into sontu_private.connection_contexts(owner_user_id, name) values(uid, n) returning id into selected_context_id;
    return jsonb_build_object('status', 'ready', 'context_id', selected_context_id);
  elsif action in ('add_member', 'remove_member') then
    selected_context_id := (input->>'context_id')::uuid;
    target := (input->>'user_id')::uuid;
    if not exists(select 1 from sontu_private.connection_contexts x where x.id = selected_context_id and x.owner_user_id = uid) then return jsonb_build_object('status', 'denied'); end if;
    if action = 'add_member' then
      if not exists(select 1 from sontu_private.member_connections c where c.status = 'ACCEPTED' and uid in (c.requester_user_id, c.recipient_user_id) and target in (c.requester_user_id, c.recipient_user_id)) then return jsonb_build_object('status', 'error', 'error_code', 'NOT_CONNECTED'); end if;
      insert into sontu_private.connection_context_members(context_id, member_user_id) values(selected_context_id, target) on conflict do nothing;
    else
      delete from sontu_private.connection_context_members m where m.context_id = selected_context_id and m.member_user_id = target;
    end if;
    return jsonb_build_object('status', 'ready');
  end if;

  return jsonb_build_object('status', 'error', 'error_code', 'INVALID_ACTION');
end
$$;

revoke all on function sontu_private.public_profile_hub(text), sontu_private.connections(text,jsonb) from public, anon, authenticated;
grant execute on function sontu_private.public_profile_hub(text) to anon, authenticated;
grant execute on function sontu_private.connections(text,jsonb) to authenticated;
