create or replace function sontu_private.participant_seating(
  event_id uuid,
  token text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  participant_id uuid;
  e sontu_private.event_instances;
begin
  select * into e from sontu_private.event_instances
  where id=participant_seating.event_id and event_kind='SIMPLE';
  if not found or e.lifecycle in ('DRAFT','CANCELLED') then
    return sontu_private.fail('INVITATION_UNAVAILABLE');
  end if;

  if actor is not null and e.host_owner_user_id=actor then
    return jsonb_build_object('status','ready','assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'attendee_name',a.attendee_name,'table_label',t.label
      ) order by a.attendee_name)
      from sontu_private.event_seating_assignments a
      join sontu_private.event_seating_tables t on t.id=a.seating_table_id
      where a.event_instance_id=e.id and a.host_user_id=actor
    ),'[]'::jsonb));
  end if;

  participant_id:=sontu_private.current_event_participant(event_id,token);
  if participant_id is null then
    return sontu_private.fail('INVITATION_UNAVAILABLE');
  end if;
  return jsonb_build_object('status','ready','assignments',coalesce((
    select jsonb_agg(jsonb_build_object(
      'attendee_name',a.attendee_name,'table_label',t.label
    ) order by a.attendee_name)
    from sontu_private.event_seating_assignments a
    join sontu_private.event_seating_tables t on t.id=a.seating_table_id
    where a.event_participant_id=participant_id
  ),'[]'::jsonb));
end
$$;

revoke all on function sontu_private.participant_seating(uuid,text) from public;
grant execute on function sontu_private.participant_seating(uuid,text) to anon,authenticated;
