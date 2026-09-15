alter table sontu_private.event_host_questions add column participant_seen_at timestamptz;

create function sontu_private.event_question_notifications(action text default 'read', question_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q sontu_private.event_host_questions;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if action='read' then
  return jsonb_build_object('status','ready','items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'event_id',x.event_instance_id,'event_title',v.title,'response',x.response,'answered_at',x.answered_at) order by x.answered_at desc) from sontu_private.event_host_questions x join sontu_private.event_instances e on e.id=x.event_instance_id join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number where x.participant_user_id=actor and x.state='ANSWERED' and x.response is not null and x.participant_seen_at is null),'[]'::jsonb));
 elsif action='mark_seen' then
  update sontu_private.event_host_questions set participant_seen_at=now() where id=question_id and participant_user_id=actor and state='ANSWERED' returning * into q;
  if q.id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  return jsonb_build_object('status','ready','id',q.id);
 end if;
 return sontu_private.fail('INVALID_INPUT');
end $$;
revoke all on function sontu_private.event_question_notifications(text,uuid) from public,anon;
grant execute on function sontu_private.event_question_notifications(text,uuid) to authenticated;
create function public.sontu_event_question_notifications(action text default 'read',question_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_question_notifications(action,question_id) $$;
revoke all on function public.sontu_event_question_notifications(text,uuid) from public,anon;
grant execute on function public.sontu_event_question_notifications(text,uuid) to authenticated;
