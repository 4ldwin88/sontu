create function sontu_private.rsvp_response_summary(event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from sontu_private.event_instances e where e.id=rsvp_response_summary.event_id and e.host_owner_user_id=actor and e.event_kind='SIMPLE') then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','responses',coalesce((
    select jsonb_agg(jsonb_build_object('participant_id',p.id,'invitee_name',p.display_name,'attendee_name',a.attendee_name,'question',q.prompt,'answer',a.answer,'updated_at',a.updated_at) order by p.display_name,a.attendee_name nulls first,q.sort_order)
    from sontu_private.event_rsvp_answers a
    join sontu_private.event_participants p on p.id=a.event_participant_id
    join sontu_private.event_rsvp_questions q on q.id=a.question_id
    where p.event_instance_id=rsvp_response_summary.event_id
  ),'[]'::jsonb));
end $$;
create function public.sontu_rsvp_response_summary(event_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.rsvp_response_summary(event_id) $$;
revoke all on function sontu_private.rsvp_response_summary(uuid),public.sontu_rsvp_response_summary(uuid) from public,anon;
grant execute on function public.sontu_rsvp_response_summary(uuid) to authenticated;
