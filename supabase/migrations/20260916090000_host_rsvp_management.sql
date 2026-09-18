create or replace function sontu_private.event_hub(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  mail text := sontu_private.verified_email();
  e sontu_private.event_instances;
  v sontu_private.event_versions;
  participant sontu_private.event_participants;
  is_host boolean;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into e from sontu_private.event_instances where id = event_hub.event_id;
  if not found or e.event_kind <> 'SIMPLE' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  is_host := sontu_private.can_manage_event_state(e.id, actor);
  if not is_host then
    select * into participant
      from sontu_private.event_participants p
      where p.event_instance_id = e.id
        and (
          p.participant_user_id = actor
          or (
            p.participant_user_id is null
            and p.invitation_email = mail
            and p.token_revoked_at is null
            and p.token_expires_at > now()
          )
        )
      order by (p.participant_user_id = actor) desc
      limit 1;
    if participant.id is null or e.lifecycle = 'DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  end if;
  select * into v
    from sontu_private.event_versions
    where event_instance_id = e.id
      and version_number = e.current_version_number;
  return jsonb_build_object(
    'status', 'ready',
    'event', jsonb_build_object(
      'id', e.id,
      'title', v.title,
      'description', v.description,
      'starts_at', v.starts_at,
      'ends_at', v.ends_at,
      'timezone', v.timezone,
      'venue_label', v.venue_label,
      'cover_key', v.cover_key,
      'capacity', v.capacity,
      'lifecycle', e.lifecycle,
      'current_version', e.current_version_number,
      'category', coalesce(e.event_category, 'Event'),
      'format', coalesce(e.event_format, 'in-person')
    ),
    'viewer', jsonb_build_object(
      'hosting', is_host,
      'display_name', participant.display_name,
      'commitment_state', participant.commitment_state,
      'invitation_state', participant.invitation_state,
      'event_visibility', participant.event_visibility
    ),
    'host', (
      select jsonb_build_object(
        'display_name', coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1)),
        'handle', ap.handle,
        'avatar_path', ap.avatar_path
      )
      from auth.users u
      left join sontu_private.account_profiles ap on ap.user_id = u.id
      where u.id = e.host_owner_user_id
    ),
    'going', coalesce((
      select jsonb_agg(g order by g.sort_order, g.display_name)
      from (
        select
          0 as sort_order,
          null::uuid as participant_id,
          'HOST'::text as source_kind,
          coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1)) as display_name,
          'Host'::text as badge,
          ap.handle,
          ap.avatar_path,
          'PUBLIC'::text as visibility,
          false as removable
        from auth.users u
        left join sontu_private.account_profiles ap on ap.user_id = u.id
        where u.id = e.host_owner_user_id
        union all
        select
          1,
          null::uuid,
          'TEAM'::text,
          coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1)),
          case when m.public_visibility = 'PUBLIC_ROLE' then initcap(replace(m.role, '_', ' ')) else 'Event team' end,
          ap.handle,
          ap.avatar_path,
          'PUBLIC'::text,
          false
        from sontu_private.event_team_members m
        join auth.users u on u.id = m.user_id
        left join sontu_private.account_profiles ap on ap.user_id = m.user_id
        where m.event_instance_id = e.id
          and m.attends_event
          and m.public_visibility <> 'HIDDEN'
        union all
        select
          2,
          case when is_host then p.id else null end,
          case when is_host then 'PARTICIPANT' else null end,
          p.display_name,
          null::text,
          case when p.event_visibility = 'PUBLIC' then ap.handle else null end,
          case when p.event_visibility = 'PUBLIC' then ap.avatar_path else null end,
          p.event_visibility,
          is_host
        from sontu_private.event_participants p
        left join sontu_private.account_profiles ap on ap.user_id = p.participant_user_id
        where p.event_instance_id = e.id
          and p.commitment_state = 'CONFIRMED'
          and p.event_visibility <> 'HIDDEN'
      ) g
    ), '[]'::jsonb)
  );
end
$$;

create or replace function sontu_private.host_participant_rsvp(event_id uuid, participant_id uuid, action text, operation_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  e sontu_private.event_instances;
  p sontu_private.event_participants;
  prior sontu_private.operations;
  fingerprint text := jsonb_build_object(
    'action', action,
    'event_id', event_id,
    'participant_id', participant_id
  )::text;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if operation_id is null or action not in ('REJECT', 'REMOVE') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into prior from sontu_private.operations o where o.id = operation_id;
  if found then
    if prior.actor_ref <> actor::text or prior.request_fingerprint <> fingerprint then
      return sontu_private.fail('IDEMPOTENCY_MISMATCH');
    end if;
    return prior.result;
  end if;
  select * into e from sontu_private.event_instances where id = host_participant_rsvp.event_id;
  if not found or e.event_kind <> 'SIMPLE' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  if not sontu_private.can_manage_event_state(e.id, actor) then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into p
    from sontu_private.event_participants ep
    where ep.event_instance_id = e.id
      and ep.id = host_participant_rsvp.participant_id
    for update;
  if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  if p.commitment_state <> 'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;

  update sontu_private.event_participants
    set commitment_state = 'RELEASED_DECLINED',
        invitation_state = case when invitation_state = 'ACCEPTED' then 'DECLINED' else invitation_state end,
        plus_one_allowance = 0
    where id = p.id;
  update sontu_private.event_admissions
    set status = 'REVOKED',
        invalidated_at = coalesce(invalidated_at, now()),
        updated_at = now()
    where event_instance_id = e.id
      and event_participant_id = p.id
      and status in ('PENDING', 'VALID', 'USED');
  update sontu_private.event_credentials c
    set status = 'REVOKED',
        replaced_at = coalesce(replaced_at, now())
    from sontu_private.event_admissions a
    where c.admission_id = a.id
      and a.event_instance_id = e.id
      and a.event_participant_id = p.id
      and c.status = 'ACTIVE';

  result := jsonb_build_object(
    'status', 'ready',
    'event_id', e.id,
    'participant_id', p.id,
    'commitment_state', 'RELEASED_DECLINED',
    'operation_id', operation_id
  );
  insert into sontu_private.operations(id, actor_ref, command_type, target_id, request_fingerprint, result)
    values(operation_id, actor::text, lower(action) || '_participant_rsvp', e.id, fingerprint, result);
  insert into sontu_private.audit_entries(event_instance_id, operation_id, actor_ref, audit_kind, metadata)
    values(e.id, operation_id, actor::text, 'HOST_REMOVED_RSVP', jsonb_build_object('participant_id', p.id, 'display_name', p.display_name));
  return result;
end
$$;

create or replace function public.sontu_host_participant_rsvp(event_id uuid, participant_id uuid, action text, operation_id uuid)
returns jsonb
language sql security invoker set search_path='' as $$
  select sontu_private.host_participant_rsvp(event_id, participant_id, action, operation_id)
$$;

revoke all on function sontu_private.event_hub(uuid), sontu_private.host_participant_rsvp(uuid, uuid, text, uuid), public.sontu_host_participant_rsvp(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function sontu_private.event_hub(uuid) to authenticated;
grant execute on function public.sontu_host_participant_rsvp(uuid, uuid, text, uuid) to authenticated;
