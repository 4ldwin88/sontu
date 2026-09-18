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
  schedule_change jsonb;
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

  schedule_change := sontu_private.latest_schedule_change(event_id);
  select sontu_private.reserved_party_places(event_id) + 1 + count(*)::integer
    into true_total
  from sontu_private.event_team_members member
  where member.event_instance_id = enriched_event_hub.event_id
    and member.attends_event;

  result := result || jsonb_build_object('organization', owner);
  result := jsonb_set(result, '{event,total_going}', to_jsonb(true_total), true);
  result := jsonb_set(
    result,
    '{event,schedule_change}',
    coalesce(schedule_change, 'null'::jsonb),
    true
  );
  return result;
end
$$;

revoke all on function sontu_private.enriched_event_hub(uuid)
  from public, anon, authenticated;
grant execute on function sontu_private.enriched_event_hub(uuid)
  to authenticated;
