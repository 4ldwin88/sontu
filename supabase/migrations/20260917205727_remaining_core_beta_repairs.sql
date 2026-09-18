create or replace function sontu_private.latest_schedule_change(target_event_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'version', current_version.version_number,
    'changed_at', current_version.created_at,
    'previous_starts_at', previous_version.starts_at,
    'previous_ends_at', previous_version.ends_at,
    'starts_at', current_version.starts_at,
    'ends_at', current_version.ends_at
  )
  from sontu_private.event_versions current_version
  join sontu_private.event_versions previous_version
    on previous_version.id = current_version.prior_version_id
  where current_version.event_instance_id = target_event_id
    and (
      current_version.starts_at is distinct from previous_version.starts_at
      or current_version.ends_at is distinct from previous_version.ends_at
    )
  order by current_version.version_number desc
  limit 1
$$;

do $$
declare definition text;
begin
  select pg_get_functiondef('sontu_private.organization_governance(text,uuid,jsonb,uuid)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'on conflict(organization_id,nominee_user_id) do update',
    'on conflict on constraint organization_successor_nomina_organization_id_nominee_user__key do update'
  );
  execute definition;
end
$$;

create or replace function sontu_private.enriched_event_hub(event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  mail text := sontu_private.verified_email();
  result jsonb;
  true_total integer;
  owner jsonb;
begin
  if actor is not null and mail is not null then
    update sontu_private.event_participants participant
      set participant_user_id = actor
      where participant.event_instance_id = enriched_event_hub.event_id
        and participant.participant_user_id is null
        and lower(participant.invitation_email) = lower(mail)
        and participant.token_revoked_at is null
        and participant.token_expires_at > now()
        and not exists (
          select 1
          from sontu_private.event_participants existing
          where existing.event_instance_id = participant.event_instance_id
            and existing.participant_user_id = actor
        );
  end if;

  result := sontu_private.event_hub(event_id);
  if result->>'status' <> 'ready' then return result; end if;

  select jsonb_build_object(
    'id', organization.id,
    'display_name', organization.display_name,
    'logo_path', organization.logo_path,
    'visibility', organization.visibility
  ) into owner
  from sontu_private.event_owner_contexts context
  join sontu_private.organizations organization on organization.id = context.organization_id
  where context.event_instance_id = enriched_event_hub.event_id
    and context.owner_kind = 'ORGANIZATION';

  result := result
    || jsonb_build_object(
      'organization', owner,
      'schedule_change', sontu_private.latest_schedule_change(event_id)
    );

  if coalesce((result#>>'{viewer,hosting}')::boolean, false) then
    select sontu_private.reserved_party_places(event_id) + 1 + count(*)::integer
      into true_total
    from sontu_private.event_team_members member
    where member.event_instance_id = enriched_event_hub.event_id
      and member.attends_event;
    result := jsonb_set(result, '{event,total_going}', to_jsonb(true_total), true);
  end if;
  return result;
end
$$;

create or replace function public.sontu_event_hub(event_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select case
    when result->>'status' <> 'ready' then result
    else jsonb_set(
      result,
      '{viewer,reconfirmation_required}',
      to_jsonb(sontu_private.event_hub_reconfirmation_required(event_id)),
      true
    )
  end
  from (select sontu_private.enriched_event_hub(event_id) as result) hub
$$;

create or replace function sontu_private.enriched_my_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  result := sontu_private.my_events();
  if result->>'status' <> 'ready' then return result; end if;
  return jsonb_set(
    result,
    '{events}',
    coalesce((
      select jsonb_agg(
        item || jsonb_build_object(
          'schedule_change', change.value,
          'schedule_changed', change.value is not null
        )
      )
      from jsonb_array_elements(result->'events') item
      left join lateral (
        select sontu_private.latest_schedule_change((item->>'id')::uuid) value
        where item->>'commitment_state' = 'CONFIRMED'
          and coalesce((item->>'hosting')::boolean, false) = false
          and exists (
            select 1
            from sontu_private.event_participants participant
            where participant.event_instance_id = (item->>'id')::uuid
              and participant.participant_user_id = actor
              and participant.commitment_state = 'CONFIRMED'
              and participant.created_at <= (
                sontu_private.latest_schedule_change((item->>'id')::uuid)->>'changed_at'
              )::timestamptz
          )
      ) change on true
    ), '[]'::jsonb),
    true
  );
end
$$;

create or replace function public.sontu_my_events()
returns jsonb language sql security invoker set search_path = ''
as $$ select sontu_private.enriched_my_events() $$;

create or replace function sontu_private.enriched_event_notification_state(action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  base jsonb;
  schedule_unread integer := 0;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action not in ('read', 'mark_all') then return sontu_private.fail('INVALID_INPUT'); end if;

  if action = 'mark_all' then
    insert into sontu_private.event_notification_reads(user_id, event_instance_id, notification_key)
    select actor, participant.event_instance_id, 'SCHEDULE:' || (change.value->>'version')
    from sontu_private.event_participants participant
    cross join lateral (
      select sontu_private.latest_schedule_change(participant.event_instance_id) value
    ) change
    where participant.participant_user_id = actor
      and participant.commitment_state = 'CONFIRMED'
      and change.value is not null
      and participant.created_at <= (change.value->>'changed_at')::timestamptz
    on conflict do nothing;
  end if;

  base := sontu_private.event_notification_state(action);
  if base->>'status' <> 'ready' then return base; end if;

  select count(*)::integer into schedule_unread
  from sontu_private.event_participants participant
  cross join lateral (
    select sontu_private.latest_schedule_change(participant.event_instance_id) value
  ) change
  where participant.participant_user_id = actor
    and participant.commitment_state = 'CONFIRMED'
    and change.value is not null
    and participant.created_at <= (change.value->>'changed_at')::timestamptz
    and not exists (
      select 1
      from sontu_private.event_notification_reads read_state
      where read_state.user_id = actor
        and read_state.event_instance_id = participant.event_instance_id
        and read_state.notification_key = 'SCHEDULE:' || (change.value->>'version')
    );

  return jsonb_set(
    base,
    '{unread_count}',
    to_jsonb(coalesce((base->>'unread_count')::integer, 0) + schedule_unread),
    true
  );
end
$$;

create or replace function public.sontu_event_notification_state(action text)
returns jsonb language sql security invoker set search_path = ''
as $$ select sontu_private.enriched_event_notification_state(action) $$;

create or replace function sontu_private.enriched_organization_governance(
  action text,
  organization_id uuid default null,
  input jsonb default '{}'::jsonb,
  operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  actor uuid := auth.uid();
begin
  result := sontu_private.organization_governance(
    action, organization_id, input, operation_id
  );
  if result->>'status' = 'ready'
    and action = 'respond_successor'
    and input->>'decision' = 'ACCEPT'
    and actor is not null then
    insert into sontu_private.organization_memberships(organization_id, user_id, role, status, updated_at)
      values(enriched_organization_governance.organization_id, actor, 'MEMBER', 'ACTIVE', now())
      on conflict on constraint organization_memberships_pkey do update
        set status = 'ACTIVE', updated_at = now();
  end if;
  return result;
end
$$;

create or replace function public.sontu_organization_governance(
  action text,
  organization_id uuid default null,
  input jsonb default '{}'::jsonb,
  operation_id uuid default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select sontu_private.enriched_organization_governance(action, organization_id, input, operation_id) $$;

revoke all on function sontu_private.latest_schedule_change(uuid),
  sontu_private.enriched_event_hub(uuid),
  sontu_private.enriched_my_events(),
  sontu_private.enriched_event_notification_state(text),
  sontu_private.enriched_organization_governance(text, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function sontu_private.enriched_event_hub(uuid),
  sontu_private.enriched_my_events(),
  sontu_private.enriched_event_notification_state(text),
  sontu_private.enriched_organization_governance(text, uuid, jsonb, uuid)
  to authenticated;
