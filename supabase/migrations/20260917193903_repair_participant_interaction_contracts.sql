create or replace function sontu_private.current_event_participant(
  event_id uuid,
  manage_token text default null
) returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select p.id
  from sontu_private.event_participants p
  left join auth.users u on u.id=auth.uid()
  where p.event_instance_id=current_event_participant.event_id
    and p.commitment_state='CONFIRMED'
    and (
      (
        manage_token is not null
        and p.token_hash=sha256(convert_to(manage_token,'UTF8'))
        and p.token_revoked_at is null
        and p.token_expires_at>now()
      )
      or (
        auth.uid() is not null
        and (
          p.participant_user_id=auth.uid()
          or (
            p.participant_user_id is null
            and u.email_confirmed_at is not null
            and lower(p.invitation_email)=lower(u.email)
          )
        )
      )
    )
  order by (p.participant_user_id=auth.uid()) desc, p.created_at desc
  limit 1
$$;

revoke all on function sontu_private.current_event_participant(uuid,text) from public,anon,authenticated;

create or replace function sontu_private.participant_accommodation(
  action text,
  event_id uuid,
  token text,
  content text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  participant_id uuid;
  e sontu_private.event_instances;
  r sontu_private.event_accommodation_requests;
  clean text:=nullif(btrim(content),'');
begin
  select * into e
  from sontu_private.event_instances
  where id=participant_accommodation.event_id and event_kind='SIMPLE';
  if not found then return sontu_private.fail('INVALID_INPUT'); end if;

  participant_id:=sontu_private.current_event_participant(event_id,token);
  if participant_id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;

  perform sontu_private.purge_expired_accommodation_content();
  if action='SAVE' then
    if e.lifecycle not in ('PUBLISHED','IN_PROGRESS')
      or char_length(clean) not between 1 and 1000 then
      return sontu_private.fail('INVALID_STATE');
    end if;
    insert into sontu_private.event_accommodation_requests(
      event_instance_id,event_participant_id,request_content,status
    ) values(e.id,participant_id,clean,'OPEN')
    on conflict(event_participant_id) do update
      set request_content=excluded.request_content,status='OPEN',updated_at=now(),
          withdrawn_at=null,content_deleted_at=null;
  elsif action='WITHDRAW' then
    if e.lifecycle not in ('PUBLISHED','IN_PROGRESS') then
      return sontu_private.fail('INVALID_STATE');
    end if;
    update sontu_private.event_accommodation_requests
    set request_content=null,status='WITHDRAWN',withdrawn_at=now(),
        content_deleted_at=now(),updated_at=now()
    where event_participant_id=participant_id;
  elsif action<>'READ' then
    return sontu_private.fail('INVALID_INPUT');
  end if;

  select * into r
  from sontu_private.event_accommodation_requests
  where event_participant_id=participant_id;
  return jsonb_build_object(
    'status','ready',
    'editable',e.lifecycle in ('PUBLISHED','IN_PROGRESS'),
    'request',case when r.id is null then null else jsonb_build_object(
      'content',r.request_content,'status',r.status,'updated_at',r.updated_at
    ) end
  );
end
$$;

create or replace function sontu_private.event_host_questions(
  action text,
  event_id uuid,
  question_id uuid default null,
  body text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor uuid:=auth.uid(); q sontu_private.event_host_questions;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='read' then
    if not (
      sontu_private.can_manage_event_state(event_id,actor)
      or exists(
        select 1 from sontu_private.event_host_questions x
        where x.event_instance_id=event_id and x.participant_user_id=actor
      )
      or sontu_private.current_event_participant(event_id,null) is not null
    ) then return sontu_private.fail('UNAUTHORIZED'); end if;
    return jsonb_build_object('status','ready','items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'question',x.question,'response',x.response,
        'state',x.state,'created_at',x.created_at
      ) order by x.created_at desc)
      from sontu_private.event_host_questions x
      where x.event_instance_id=event_id
        and (x.participant_user_id=actor or sontu_private.can_manage_event_state(event_id,actor))
    ),'[]'::jsonb));
  end if;
  if action='ask' then
    if char_length(btrim(coalesce(body,''))) not between 1 and 1000
      or sontu_private.current_event_participant(event_id,null) is null
      or not exists(
        select 1 from sontu_private.event_instances e
        where e.id=event_id and e.lifecycle in ('PUBLISHED','IN_PROGRESS')
      ) then return sontu_private.fail('UNAUTHORIZED'); end if;
    insert into sontu_private.event_host_questions(event_instance_id,participant_user_id,question)
    values(event_id,actor,btrim(body)) returning * into q;
    return jsonb_build_object('status','ready','id',q.id);
  end if;
  if action in ('answer','close') then
    if (action='answer' and char_length(btrim(coalesce(body,''))) not between 1 and 2000)
      or not sontu_private.can_manage_event_state(event_id,actor) then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    update sontu_private.event_host_questions
    set response=case when action='answer' then btrim(body) else response end,
        state=case when action='answer' then 'ANSWERED' else 'CLOSED' end,
        answered_at=now(),answered_by=actor
    where id=question_id and event_instance_id=event_id returning * into q;
    if q.id is null then return sontu_private.fail('INVALID_INPUT'); end if;
    return jsonb_build_object('status','ready','id',q.id);
  end if;
  return sontu_private.fail('INVALID_INPUT');
end
$$;

revoke all on function sontu_private.participant_accommodation(text,uuid,text,text),
  sontu_private.event_host_questions(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function sontu_private.participant_accommodation(text,uuid,text,text) to anon,authenticated;
grant execute on function sontu_private.event_host_questions(text,uuid,uuid,text) to authenticated;

create or replace function sontu_private.rsvp_form(
  action text,
  event_id uuid,
  token text default null,
  payload jsonb default null,
  operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); e sontu_private.event_instances;
  p sontu_private.event_participants; question_row record; oldop sontu_private.operations;
  questions jsonb; attendees jsonb:=coalesce(payload->'attendees','[]'::jsonb);
  item jsonb; answers jsonb; attendee text; answer text; fingerprint text;
  max_attendees integer; idx integer:=0; audit_operation uuid; participant_id uuid;
begin
  if action not in ('READ','CONFIGURE','SAVE') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into e from sontu_private.event_instances
    where id=rsvp_form.event_id and event_kind='SIMPLE' for update;
  if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;

  if action='CONFIGURE' then
    if actor is null or e.host_owner_user_id<>actor
      or e.lifecycle not in ('DRAFT','PUBLISHED')
      or jsonb_typeof(payload->'questions')<>'array' then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    if jsonb_array_length(payload->'questions')>12 then return sontu_private.fail('INVALID_INPUT'); end if;
    audit_operation:=coalesce(operation_id,gen_random_uuid());
    delete from sontu_private.event_rsvp_questions where event_instance_id=e.id;
    for item in select value from jsonb_array_elements(payload->'questions') loop
      idx:=idx+1;
      if char_length(btrim(coalesce(item->>'prompt',''))) not between 1 and 180
        or coalesce(item->>'type','') not in ('SINGLE_SELECT','SHORT_TEXT') then
        return sontu_private.fail('INVALID_INPUT');
      end if;
      if item->>'type'='SINGLE_SELECT' and (
        jsonb_typeof(item->'options')<>'array'
        or jsonb_array_length(item->'options') not between 2 and 12
        or exists(
          select 1 from jsonb_array_elements_text(item->'options') x
          where char_length(btrim(x)) not between 1 and 80
        )
      ) then return sontu_private.fail('INVALID_INPUT'); end if;
      if item->>'type'='SHORT_TEXT'
        and coalesce((item->>'per_attendee')::boolean,false) then
        return sontu_private.fail('INVALID_INPUT');
      end if;
      insert into sontu_private.event_rsvp_questions(
        event_instance_id,prompt,question_type,required,applies_to_party,options,sort_order
      ) values(
        e.id,btrim(item->>'prompt'),item->>'type',
        coalesce((item->>'required')::boolean,false),
        coalesce((item->>'per_attendee')::boolean,false),
        case when item->>'type'='SINGLE_SELECT' then item->'options' else '[]'::jsonb end,
        idx
      );
    end loop;
    insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(e.id,audit_operation,actor::text,'rsvp_form_configured',jsonb_build_object('question_count',idx));
  else
    if action='READ' and actor=e.host_owner_user_id then
      p:=null;
    else
      participant_id:=sontu_private.current_event_participant(event_id,token);
      if participant_id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
      select * into p from sontu_private.event_participants where id=participant_id for update;
    end if;
    if action='SAVE' then
      if operation_id is null or e.lifecycle not in ('PUBLISHED','IN_PROGRESS')
        or jsonb_typeof(attendees)<>'array' then return sontu_private.fail('INVALID_INPUT'); end if;
      max_attendees:=1+p.plus_one_allowance;
      if jsonb_array_length(attendees) not between 1 and max_attendees then return sontu_private.fail('INVALID_INPUT'); end if;
      if exists(
        select 1 from jsonb_array_elements(attendees) a
        where char_length(btrim(coalesce(a->>'name',''))) not between 1 and 100
          or jsonb_typeof(a->'answers')<>'object'
      ) then return sontu_private.fail('INVALID_INPUT'); end if;
      fingerprint:=jsonb_build_object('event',e.id,'participant',p.id,'payload',payload)::text;
      perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
      select * into oldop from sontu_private.operations where id=operation_id;
      if found then
        if oldop.actor_ref<>p.id::text or oldop.request_fingerprint<>fingerprint then
          return sontu_private.fail('IDEMPOTENCY_MISMATCH');
        end if;
        return oldop.result;
      end if;
      for question_row in select * from sontu_private.event_rsvp_questions where event_instance_id=e.id order by sort_order loop
        for item in select value from jsonb_array_elements(attendees) loop
          attendee:=btrim(item->>'name'); answers:=item->'answers';
          answer:=nullif(btrim(answers->>question_row.id::text),'');
          if not question_row.applies_to_party and attendee<>btrim((attendees->0)->>'name') then continue; end if;
          if question_row.required and answer is null then return sontu_private.fail('RSVP_INCOMPLETE'); end if;
          if answer is not null then
            if char_length(answer)>300 then return sontu_private.fail('INVALID_INPUT'); end if;
            if question_row.question_type='SINGLE_SELECT' and not exists(
              select 1 from jsonb_array_elements_text(question_row.options) option_value
              where option_value=answer
            ) then return sontu_private.fail('INVALID_INPUT'); end if;
          end if;
        end loop;
      end loop;
      delete from sontu_private.event_rsvp_answers where event_participant_id=p.id;
      for question_row in select * from sontu_private.event_rsvp_questions where event_instance_id=e.id order by sort_order loop
        for item in select value from jsonb_array_elements(attendees) loop
          attendee:=btrim(item->>'name'); answers:=item->'answers';
          answer:=nullif(btrim(answers->>question_row.id::text),'');
          if answer is not null and (question_row.applies_to_party or attendee=btrim((attendees->0)->>'name')) then
            insert into sontu_private.event_rsvp_answers(event_participant_id,question_id,attendee_name,answer)
            values(p.id,question_row.id,case when question_row.applies_to_party then attendee else null end,answer);
          end if;
        end loop;
      end loop;
      insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
      values(operation_id,p.id::text,'save_structured_rsvp',e.id,fingerprint,jsonb_build_object('status','ready','event_id',e.id));
      insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
      values(e.id,operation_id,p.id::text,'structured_rsvp_saved',jsonb_build_object('attendee_count',jsonb_array_length(attendees)));
      return jsonb_build_object('status','ready','event_id',e.id);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',rq.id,'prompt',rq.prompt,'type',rq.question_type,'required',rq.required,
    'per_attendee',rq.applies_to_party,'options',rq.options
  ) order by rq.sort_order),'[]'::jsonb)
  into questions
  from sontu_private.event_rsvp_questions rq where rq.event_instance_id=e.id;
  return jsonb_build_object(
    'status','ready','plus_one_allowance',coalesce(p.plus_one_allowance,0),
    'questions',questions,
    'answers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id',a.question_id,'attendee_name',a.attendee_name,'answer',a.answer
      )) from sontu_private.event_rsvp_answers a where a.event_participant_id=p.id
    ),'[]'::jsonb)
  );
end
$$;

revoke all on function sontu_private.rsvp_form(text,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function sontu_private.rsvp_form(text,uuid,text,jsonb,uuid) to anon,authenticated;

create or replace function sontu_private.event_seating(
  action text,event_id uuid,table_id uuid default null,
  participant_id uuid default null,attendee_name text default null,
  table_label text default null,table_capacity integer default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); e sontu_private.event_instances;
  t sontu_private.event_seating_tables;
  participant_row sontu_private.event_participants;
  clean_label text:=btrim(coalesce(table_label,''));
  clean_name text:=btrim(coalesce(attendee_name,''));
  assigned integer;
begin
  if action not in ('READ','UPSERT_TABLE','DELETE_TABLE','ASSIGN','UNASSIGN') then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  select * into e from sontu_private.event_instances ei
  where ei.id=event_seating.event_id and ei.host_owner_user_id=actor and ei.event_kind='SIMPLE'
  for update;
  if actor is null or not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='UPSERT_TABLE' then
    if char_length(clean_label) not between 1 and 80 or table_capacity not between 1 and 100 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
    if table_id is null then
      insert into sontu_private.event_seating_tables(event_instance_id,label,capacity)
      values(e.id,clean_label,table_capacity);
    else
      select * into t from sontu_private.event_seating_tables st
      where st.id=table_id and st.event_instance_id=e.id for update;
      if not found then return sontu_private.fail('INVALID_INPUT'); end if;
      select count(*) into assigned from sontu_private.event_seating_assignments esa
      where esa.seating_table_id=t.id;
      if assigned>table_capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      update sontu_private.event_seating_tables st
      set label=clean_label,capacity=table_capacity,updated_at=now() where st.id=t.id;
    end if;
  elsif action='DELETE_TABLE' then
    delete from sontu_private.event_seating_tables st
    where st.id=table_id and st.event_instance_id=e.id;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  elsif action='ASSIGN' then
    select * into t from sontu_private.event_seating_tables st
    where st.id=table_id and st.event_instance_id=e.id for update;
    select * into participant_row from sontu_private.event_participants ep
    where ep.id=participant_id and ep.event_instance_id=e.id
      and ep.commitment_state='CONFIRMED';
    if not found or t.id is null or char_length(clean_name) not between 1 and 100 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
    select count(*) into assigned from sontu_private.event_seating_assignments esa
    where esa.seating_table_id=t.id;
    if assigned>=t.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
    delete from sontu_private.event_seating_assignments esa
    where esa.event_participant_id=participant_row.id and esa.attendee_name=clean_name;
    insert into sontu_private.event_seating_assignments(
      event_instance_id,seating_table_id,event_participant_id,attendee_name
    ) values(e.id,t.id,participant_row.id,clean_name);
  elsif action='UNASSIGN' then
    delete from sontu_private.event_seating_assignments esa
    where esa.event_instance_id=e.id and esa.event_participant_id=participant_id
      and esa.attendee_name=clean_name;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  end if;
  if action<>'READ' then
    insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(e.id,gen_random_uuid(),actor::text,'event_seating_'||lower(action),
      jsonb_build_object('table_id',table_id,'participant_id',participant_id,'attendee_name',clean_name));
  end if;
  return jsonb_build_object('status','ready','tables',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',st.id,'label',st.label,'capacity',st.capacity,
      'assigned_count',(select count(*) from sontu_private.event_seating_assignments a where a.seating_table_id=st.id),
      'assignments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'participant_id',a.event_participant_id,'attendee_name',a.attendee_name,
          'invitee_name',ep.display_name
        ) order by a.attendee_name)
        from sontu_private.event_seating_assignments a
        join sontu_private.event_participants ep on ep.id=a.event_participant_id
        where a.seating_table_id=st.id
      ),'[]'::jsonb)
    ) order by st.label)
    from sontu_private.event_seating_tables st where st.event_instance_id=e.id
  ),'[]'::jsonb));
end
$$;

revoke all on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) from public;
grant execute on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) to authenticated;
