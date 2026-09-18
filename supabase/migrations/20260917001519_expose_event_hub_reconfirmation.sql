create function sontu_private.event_hub_reconfirmation_required(event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from sontu_private.event_participants p
    join sontu_private.participant_reconfirmations r
      on r.event_participant_id = p.id
    join sontu_private.consequence_cases c
      on c.id = r.consequence_case_id
    where p.event_instance_id = event_hub_reconfirmation_required.event_id
      and p.participant_user_id = auth.uid()
      and p.commitment_state = 'CONFIRMED'
      and r.state = 'AWAITING_RESPONSE'
      and c.disposition in ('OPEN_UNRESOLVED', 'PENDING_EXTERNAL')
  )
$$;

revoke all on function sontu_private.event_hub_reconfirmation_required(uuid)
  from public, anon, authenticated;
grant execute on function sontu_private.event_hub_reconfirmation_required(uuid)
  to authenticated;

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
  from (select sontu_private.event_hub(event_id) as result) hub
$$;

revoke all on function public.sontu_event_hub(uuid)
  from public, anon, authenticated;
grant execute on function public.sontu_event_hub(uuid) to authenticated;
