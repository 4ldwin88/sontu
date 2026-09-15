create or replace function sontu_private.event_host_questions(action text,event_id uuid,question_id uuid default null,body text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q sontu_private.event_host_questions;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if action='read' then
  if not (sontu_private.can_manage_event_state(event_id,actor) or exists(select 1 from sontu_private.event_host_questions x where x.event_instance_id=event_id and x.participant_user_id=actor)) then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'question',x.question,'response',x.response,'state',x.state,'created_at',x.created_at) order by x.created_at desc) from sontu_private.event_host_questions x where x.event_instance_id=event_id and (x.participant_user_id=actor or sontu_private.can_manage_event_state(event_id,actor))),'[]'::jsonb));
 end if;
 if action='ask' then
  if char_length(btrim(coalesce(body,''))) not between 1 and 1000 or not exists(select 1 from sontu_private.event_participants p join sontu_private.event_instances e on e.id=p.event_instance_id where p.event_instance_id=event_id and p.participant_user_id=actor and p.commitment_state='CONFIRMED' and e.lifecycle='PUBLISHED') then return sontu_private.fail('UNAUTHORIZED'); end if;
  insert into sontu_private.event_host_questions(event_instance_id,participant_user_id,question) values(event_id,actor,btrim(body)) returning * into q; return jsonb_build_object('status','ready','id',q.id);
 end if;
 if action in ('answer','close') then
  if (action='answer' and char_length(btrim(coalesce(body,''))) not between 1 and 2000) or not sontu_private.can_manage_event_state(event_id,actor) then return sontu_private.fail('UNAUTHORIZED'); end if;
  update sontu_private.event_host_questions set response=case when action='answer' then btrim(body) else response end,state=case when action='answer' then 'ANSWERED' else 'CLOSED' end,answered_at=now(),answered_by=actor where id=question_id and event_instance_id=event_id returning * into q; if q.id is null then return sontu_private.fail('INVALID_INPUT'); end if; return jsonb_build_object('status','ready','id',q.id);
 end if;
 return sontu_private.fail('INVALID_INPUT');
end $$;
revoke all on function sontu_private.event_host_questions(text,uuid,uuid,text) from public,anon,authenticated;
