-- Field-level profile visibility and unilateral Close Connection trust.
alter table sontu_private.account_profiles
  add column bio text not null default '' check (char_length(bio) <= 240),
  add column bio_visibility text not null default 'GENERAL' check (bio_visibility in ('GENERAL','CLOSE','ONLY_ME')),
  add column link_label text not null default '' check (char_length(link_label) <= 80),
  add column link_url text not null default '' check (char_length(link_url) <= 240),
  add column link_visibility text not null default 'GENERAL' check (link_visibility in ('GENERAL','CLOSE','ONLY_ME'));

alter table sontu_private.member_connections
  add column requester_marks_close boolean not null default false,
  add column recipient_marks_close boolean not null default false;

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
    if n is null or char_length(n) not between 1 and 80 or char_length(d) > 80 then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_NAME');
    end if;
    if char_length(profile_bio) > 240 or char_length(profile_link_label) > 80 or char_length(profile_link_url) > 240 then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_PROFILE_FIELD');
    end if;
    if profile_bio_visibility not in ('GENERAL','CLOSE','ONLY_ME') or profile_link_visibility not in ('GENERAL','CLOSE','ONLY_ME') then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_VISIBILITY');
    end if;
    if profile_link_url <> '' and profile_link_url !~* '^https://[^[:space:]]+$' then
      return jsonb_build_object('status', 'error', 'error_code', 'INVALID_LINK');
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
            event_email_enabled = event_mail,
            bio = profile_bio,
            bio_visibility = profile_bio_visibility,
            link_label = profile_link_label,
            link_url = profile_link_url,
            link_visibility = profile_link_visibility,
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
  close_viewer boolean := false;
  owner_viewer boolean := false;
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

  owner_viewer := viewer = profile_row.user_id;
  if viewer is not null and not owner_viewer then
    select exists(
      select 1
      from sontu_private.member_connections c
      where c.status = 'ACCEPTED'
        and c.requester_user_id = profile_row.user_id
        and c.recipient_user_id = viewer
        and c.requester_marks_close
    ) or exists(
      select 1
      from sontu_private.member_connections c
      where c.status = 'ACCEPTED'
        and c.recipient_user_id = profile_row.user_id
        and c.requester_user_id = viewer
        and c.recipient_marks_close
    ) into close_viewer;
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
      'close', close_viewer
    ),
    'profile', jsonb_build_object(
      'display_name', coalesce(nullif(profile_row.display_name, ''), profile_row.first_name),
      'handle', profile_row.handle,
      'fields', fields
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
