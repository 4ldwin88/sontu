create table sontu_private.event_host_questions (
 id uuid primary key default gen_random_uuid(), event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
 participant_user_id uuid not null references auth.users(id) on delete cascade, question text not null check(char_length(question) between 1 and 1000),
 response text check(response is null or char_length(response)<=2000), state text not null default 'OPEN' check(state in ('OPEN','ANSWERED','CLOSED')),
 created_at timestamptz not null default now(), answered_at timestamptz, answered_by uuid references auth.users(id));
create index event_host_questions_event_created_idx on sontu_private.event_host_questions(event_instance_id,created_at desc);
alter table sontu_private.event_host_questions enable row level security;
revoke all on sontu_private.event_host_questions from anon,authenticated;
create function sontu_private.event_host_questions(action text,event_id uuid,question_id uuid default null,body text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q sontu_private.event_host_questions;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if action='read' then return jsonb_build_object('status','ready','items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'question',x.question,'response',x.response,'state',x.state,'created_at',x.created_at) order by x.created_at desc) from sontu_private.event_host_questions x join sontu_private.event_instances e on e.id=x.event_instance_id where x.event_instance_id=event_id and (x.participant_user_id=actor or e.host_owner_user_id=actor)),'[]'::jsonb)); end if;
 if action='ask' then if char_length(btrim(coalesce(body,''))) not between 1 and 1000 then return sontu_private.fail('INVALID_INPUT'); end if; if not exists(select 1 from sontu_private.event_participants p join sontu_private.event_instances e on e.id=p.event_instance_id where p.event_instance_id=event_id and p.participant_user_id=actor and p.commitment_state='CONFIRMED' and e.lifecycle='PUBLISHED') then return sontu_private.fail('UNAUTHORIZED'); end if; insert into sontu_private.event_host_questions(event_instance_id,participant_user_id,question) values(event_id,actor,btrim(body)) returning * into q; return jsonb_build_object('status','ready','id',q.id); end if;
 if action in ('answer','close') then if action='answer' and char_length(btrim(coalesce(body,''))) not between 1 and 2000 then return sontu_private.fail('INVALID_INPUT'); end if; if not exists(select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=actor) then return sontu_private.fail('UNAUTHORIZED'); end if; update sontu_private.event_host_questions set response=case when action='answer' then btrim(body) else response end,state=case when action='answer' then 'ANSWERED' else 'CLOSED' end,answered_at=now(),answered_by=actor where id=question_id and event_instance_id=event_id returning * into q; if q.id is null then return sontu_private.fail('INVALID_INPUT'); end if; return jsonb_build_object('status','ready','id',q.id); end if;
 return sontu_private.fail('INVALID_INPUT'); end $$;
create function public.sontu_event_host_questions(action text,event_id uuid,question_id uuid default null,body text default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_host_questions(action,event_id,question_id,body) $$;
revoke all on function sontu_private.event_host_questions(text,uuid,uuid,text),public.sontu_event_host_questions(text,uuid,uuid,text) from public,anon;
grant execute on function public.sontu_event_host_questions(text,uuid,uuid,text) to authenticated;
