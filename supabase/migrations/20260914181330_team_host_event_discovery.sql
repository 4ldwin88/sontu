-- Event management is a contextual relationship. Co-hosts and event managers
-- need to discover the event and enter its bounded host surface; it does not
-- make check-in staff or other event-team roles into hosts.
create or replace function sontu_private.my_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare mail text := sontu_private.verified_email();
begin
  if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status', 'ready', 'events', coalesce((
    select jsonb_agg(x order by x.starts_at nulls last, x.id)
    from (
      select e.id, e.lifecycle, e.event_category as category, e.event_format as format,
        v.title, v.starts_at, v.ends_at, v.description, v.timezone, v.venue_label, v.cover_key, v.capacity,
        sontu_private.can_manage_event_state(e.id, auth.uid()) as hosting,
        p.commitment_state, p.invitation_state,
        exists (select 1 from sontu_private.participant_reconfirmations r join sontu_private.consequence_cases c on c.id = r.consequence_case_id where r.event_participant_id = p.id and r.state = 'AWAITING_RESPONSE' and c.disposition in ('OPEN_UNRESOLVED', 'PENDING_EXTERNAL')) as reconfirmation_required,
        oc.owner_kind, case when oc.owner_kind = 'ORGANIZATION' then o.display_name else 'Personal' end as owner_name
      from sontu_private.event_instances e
      join sontu_private.event_versions v on v.event_instance_id = e.id and v.version_number = e.current_version_number
      join sontu_private.event_owner_contexts oc on oc.event_instance_id = e.id
      left join sontu_private.organizations o on o.id = oc.organization_id
      left join sontu_private.event_participants p on p.event_instance_id = e.id and (p.participant_user_id = auth.uid() or (p.participant_user_id is null and p.invitation_email = mail and p.token_revoked_at is null and p.token_expires_at > now()))
      where e.event_kind = 'SIMPLE'
        and (sontu_private.can_manage_event_state(e.id, auth.uid()) or (p.id is not null and e.lifecycle <> 'DRAFT'))
    ) x
  ), '[]'::jsonb));
end
$$;

create or replace function sontu_private.event_hub(event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid(); mail text := sontu_private.verified_email();
  e sontu_private.event_instances; v sontu_private.event_versions;
  participant sontu_private.event_participants; is_host boolean;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into e from sontu_private.event_instances where id = event_hub.event_id;
  if not found or e.event_kind <> 'SIMPLE' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  is_host := sontu_private.can_manage_event_state(e.id, actor);
  if not is_host then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id = e.id and (p.participant_user_id = actor or (p.participant_user_id is null and p.invitation_email = mail and p.token_revoked_at is null and p.token_expires_at > now()))
      order by (p.participant_user_id = actor) desc
      limit 1;
    if participant.id is null or e.lifecycle = 'DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  end if;
  select * into v from sontu_private.event_versions where event_instance_id = e.id and version_number = e.current_version_number;
  return jsonb_build_object('status', 'ready',
    'event', jsonb_build_object('id', e.id, 'title', v.title, 'description', v.description, 'starts_at', v.starts_at, 'ends_at', v.ends_at, 'timezone', v.timezone, 'venue_label', v.venue_label, 'cover_key', v.cover_key, 'capacity', v.capacity, 'lifecycle', e.lifecycle, 'current_version', e.current_version_number, 'category', coalesce(e.event_category, 'Event'), 'format', coalesce(e.event_format, 'in-person')),
    'viewer', jsonb_build_object('hosting', is_host, 'display_name', participant.display_name, 'commitment_state', participant.commitment_state, 'invitation_state', participant.invitation_state),
    'host', (select jsonb_build_object('display_name', coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1))) from auth.users u left join sontu_private.account_profiles ap on ap.user_id = u.id where u.id = e.host_owner_user_id),
    'going', coalesce((
      select jsonb_agg(g order by g.sort_order, g.display_name) from (
        select 0 as sort_order, coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1)) as display_name, 'Host'::text as badge from auth.users u left join sontu_private.account_profiles ap on ap.user_id = u.id where u.id = e.host_owner_user_id
        union all
        select 1, coalesce(nullif(ap.display_name, ''), ap.first_name, split_part(u.email, '@', 1)), case when m.public_visibility = 'PUBLIC_ROLE' then initcap(replace(m.role, '_', ' ')) else 'Event team' end from sontu_private.event_team_members m join auth.users u on u.id = m.user_id left join sontu_private.account_profiles ap on ap.user_id = m.user_id where m.event_instance_id = e.id and m.attends_event and m.public_visibility <> 'HIDDEN'
        union all
        select 2, p.display_name, null::text from sontu_private.event_participants p where p.event_instance_id = e.id and p.commitment_state = 'CONFIRMED'
      ) g
    ), '[]'::jsonb));
end
$$;

revoke all on function sontu_private.my_events(), sontu_private.event_hub(uuid)
  from public, anon, authenticated;
