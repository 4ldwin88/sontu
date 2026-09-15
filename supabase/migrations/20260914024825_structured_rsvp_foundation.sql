-- Structured RSVP is deliberately event-scoped. It augments one person's
-- invitation/party; it is not an account, contact, or ticketing model.
alter table sontu_private.event_participants
  add column plus_one_allowance integer not null default 0
    check (plus_one_allowance between 0 and 10);

create table sontu_private.event_rsvp_questions (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 180),
  question_type text not null check (question_type in ('SINGLE_SELECT','SHORT_TEXT')),
  required boolean not null default false,
  applies_to_party boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_instance_id, sort_order)
);
create index event_rsvp_questions_event_sort_idx on sontu_private.event_rsvp_questions(event_instance_id,sort_order);

create table sontu_private.event_rsvp_answers (
  id uuid primary key default gen_random_uuid(),
  event_participant_id uuid not null references sontu_private.event_participants(id) on delete cascade,
  question_id uuid not null references sontu_private.event_rsvp_questions(id) on delete cascade,
  attendee_name text,
  answer text not null check (char_length(btrim(answer)) between 1 and 300),
  updated_at timestamptz not null default now(),
  unique(event_participant_id, question_id, attendee_name)
);
create index event_rsvp_answers_participant_idx on sontu_private.event_rsvp_answers(event_participant_id);

-- The host can keep the RSVP light: one choice question or a short note.
-- Options that apply to the party (for example, meal choices) collect one
-- answer for each named attendee. The invitation token remains the only
-- accountless credential.
create function sontu_private.rsvp_form(
  action text,
  event_id uuid,
  token text default null,
  payload jsonb default null,
  operation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); e sontu_private.event_instances;
  p sontu_private.event_participants; q record; oldop sontu_private.operations;
  questions jsonb; attendees jsonb:=coalesce(payload->'attendees','[]'::jsonb);
  item jsonb; answers jsonb; attendee text; answer text; fingerprint text;
  max_attendees integer; idx integer:=0; option_values text[];
begin
  if action not in ('READ','CONFIGURE','SAVE') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into e from sontu_private.event_instances where id=rsvp_form.event_id and event_kind='SIMPLE' for update;
  if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;

  if action='CONFIGURE' then
    if actor is null or e.host_owner_user_id<>actor or e.lifecycle not in ('DRAFT','PUBLISHED') or jsonb_typeof(payload->'questions')<>'array' then return sontu_private.fail('UNAUTHORIZED'); end if;
    if jsonb_array_length(payload->'questions')>12 then return sontu_private.fail('INVALID_INPUT'); end if;
    delete from sontu_private.event_rsvp_questions where event_instance_id=e.id;
    for item in select value from jsonb_array_elements(payload->'questions') loop
      idx:=idx+1;
      if char_length(btrim(coalesce(item->>'prompt',''))) not between 1 and 180
        or coalesce(item->>'type','') not in ('SINGLE_SELECT','SHORT_TEXT') then return sontu_private.fail('INVALID_INPUT'); end if;
      if item->>'type'='SINGLE_SELECT' and (
        jsonb_typeof(item->'options')<>'array' or jsonb_array_length(item->'options') not between 2 and 12
        or exists(select 1 from jsonb_array_elements_text(item->'options') x where char_length(btrim(x)) not between 1 and 80)
      ) then return sontu_private.fail('INVALID_INPUT'); end if;
      if item->>'type'='SHORT_TEXT' and coalesce((item->>'per_attendee')::boolean,false) then return sontu_private.fail('INVALID_INPUT'); end if;
      insert into sontu_private.event_rsvp_questions(event_instance_id,prompt,question_type,required,applies_to_party,options,sort_order)
      values(e.id,btrim(item->>'prompt'),item->>'type',coalesce((item->>'required')::boolean,false),coalesce((item->>'per_attendee')::boolean,false),case when item->>'type'='SINGLE_SELECT' then item->'options' else '[]'::jsonb end,idx);
    end loop;
    insert into sontu_private.audit_entries(event_instance_id,actor_ref,audit_kind,metadata)
      values(e.id,actor::text,'rsvp_form_configured',jsonb_build_object('question_count',idx));
  elsif action='SAVE' then
    if token is null or operation_id is null or e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_INPUT'); end if;
    select * into p from sontu_private.event_participants ep where ep.event_instance_id=e.id and ep.token_hash=sha256(convert_to(token,'UTF8')) and ep.token_revoked_at is null and ep.token_expires_at>now() for update;
    if p.id is null or p.commitment_state<>'CONFIRMED' or jsonb_typeof(attendees)<>'array' then return sontu_private.fail('UNAUTHORIZED'); end if;
    max_attendees:=1+p.plus_one_allowance;
    if jsonb_array_length(attendees) not between 1 and max_attendees then return sontu_private.fail('INVALID_INPUT'); end if;
    if exists(select 1 from jsonb_array_elements(attendees) a where char_length(btrim(coalesce(a->>'name',''))) not between 1 and 100 or jsonb_typeof(a->'answers')<>'object') then return sontu_private.fail('INVALID_INPUT'); end if;
    fingerprint:=jsonb_build_object('event',e.id,'participant',p.id,'payload',payload)::text;
    perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
    select * into oldop from sontu_private.operations where id=operation_id;
    if found then
      if oldop.actor_ref<>p.id::text or oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
      return oldop.result;
    end if;
    for q in select * from sontu_private.event_rsvp_questions where event_instance_id=e.id order by sort_order loop
      for item in select value from jsonb_array_elements(attendees) loop
        attendee:=btrim(item->>'name'); answers:=item->'answers'; answer:=nullif(btrim(answers->>q.id::text),'');
        if not q.applies_to_party and attendee<>btrim((attendees->0)->>'name') then continue; end if;
        if q.required and answer is null then return sontu_private.fail('RSVP_INCOMPLETE'); end if;
        if answer is not null then
          if char_length(answer)>300 then return sontu_private.fail('INVALID_INPUT'); end if;
          if q.question_type='SINGLE_SELECT' and not exists(select 1 from jsonb_array_elements_text(q.options) option_value where option_value=answer) then return sontu_private.fail('INVALID_INPUT'); end if;
        end if;
      end loop;
    end loop;
    delete from sontu_private.event_rsvp_answers where event_participant_id=p.id;
    for q in select * from sontu_private.event_rsvp_questions where event_instance_id=e.id order by sort_order loop
      for item in select value from jsonb_array_elements(attendees) loop
        attendee:=btrim(item->>'name'); answers:=item->'answers'; answer:=nullif(btrim(answers->>q.id::text),'');
        if answer is not null and (q.applies_to_party or attendee=btrim((attendees->0)->>'name')) then
          insert into sontu_private.event_rsvp_answers(event_participant_id,question_id,attendee_name,answer)
          values(p.id,q.id,case when q.applies_to_party then attendee else null end,answer);
        end if;
      end loop;
    end loop;
    insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
      values(operation_id,p.id::text,'save_structured_rsvp',e.id,fingerprint,jsonb_build_object('status','ready','event_id',e.id));
    insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
      values(e.id,operation_id,p.id::text,'structured_rsvp_saved',jsonb_build_object('attendee_count',jsonb_array_length(attendees)));
  else
    if token is not null then
      select * into p from sontu_private.event_participants ep where ep.event_instance_id=e.id and ep.token_hash=sha256(convert_to(token,'UTF8')) and ep.token_revoked_at is null and ep.token_expires_at>now();
      if p.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
    elsif actor is null or e.host_owner_user_id<>actor then return sontu_private.fail('UNAUTHORIZED'); end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'type',q.question_type,'required',q.required,'per_attendee',q.applies_to_party,'options',q.options) order by q.sort_order),'[]'::jsonb) into questions from sontu_private.event_rsvp_questions q where q.event_instance_id=e.id;
  return jsonb_build_object('status','ready','plus_one_allowance',coalesce(p.plus_one_allowance,0),'questions',questions,'answers',coalesce((select jsonb_agg(jsonb_build_object('question_id',a.question_id,'attendee_name',a.attendee_name,'answer',a.answer)) from sontu_private.event_rsvp_answers a where a.event_participant_id=p.id),'[]'::jsonb));
end $$;

create function public.sontu_rsvp_form(action text,event_id uuid,token text default null,payload jsonb default null,operation_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.rsvp_form(action,event_id,token,payload,operation_id) $$;
revoke all on function sontu_private.rsvp_form(text,uuid,text,jsonb,uuid),public.sontu_rsvp_form(text,uuid,text,jsonb,uuid) from public;
grant execute on function public.sontu_rsvp_form(text,uuid,text,jsonb,uuid) to anon,authenticated;

create function sontu_private.rsvp_party_allowance(event_id uuid,participant_id uuid,allowance integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or allowance not between 0 and 10 then return sontu_private.fail('INVALID_INPUT'); end if;
  update sontu_private.event_participants p set plus_one_allowance=allowance
  from sontu_private.event_instances e
  where p.id=participant_id and p.event_instance_id=rsvp_party_allowance.event_id
    and e.id=p.event_instance_id and e.host_owner_user_id=actor and e.lifecycle in ('DRAFT','PUBLISHED');
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','participant_id',participant_id,'plus_one_allowance',allowance);
end $$;
create function public.sontu_rsvp_party_allowance(event_id uuid,participant_id uuid,allowance integer)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.rsvp_party_allowance(event_id,participant_id,allowance) $$;
revoke all on function sontu_private.rsvp_party_allowance(uuid,uuid,integer),public.sontu_rsvp_party_allowance(uuid,uuid,integer) from public,anon;
grant execute on function public.sontu_rsvp_party_allowance(uuid,uuid,integer) to authenticated;
