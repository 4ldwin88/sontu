-- Approved device default and recipient-verified, simple named invitations.
alter table sontu_private.event_participants drop constraint event_participants_commitment_state_check;
alter table sontu_private.event_participants add constraint event_participants_commitment_state_check check(commitment_state in ('NO_COMMITMENT','CONFIRMED','RELEASED_DECLINED'));
alter table sontu_private.event_participants add column invitation_email text;
alter table sontu_private.event_participants add column invitation_state text check(invitation_state in ('CREATED','ACCEPTED','DECLINED'));
create unique index event_invitation_email on sontu_private.event_participants(event_instance_id,invitation_email) where invitation_email is not null;

create function sontu_private.verified_email() returns text language sql stable security definer set search_path='' as $$
 select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null and coalesce(is_anonymous,false)=false
$$;
revoke all on function sontu_private.verified_email() from public,anon,authenticated;
create or replace function sontu_private.host_command(cmd text, event_id uuid, expected_version integer, operation_id uuid, input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid(); e sontu_private.event_instances; v sontu_private.event_versions; nv uuid;
 c sontu_private.consequence_cases; p sontu_private.event_participants; mc uuid; cid uuid; prior_case uuid;
 oldop sontu_private.operations; fingerprint text; result jsonb; token text; newstart timestamptz; newdesc text;
 count_affected integer; provtime timestamptz; ev_existing sontu_private.evidence_records;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if operation_id is null or input is null or jsonb_typeof(input)<>'object' then return sontu_private.fail('INVALID_INPUT'); end if;
 -- Same operation is serialized before any mutation, including create.
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 fingerprint := encode(sha256(convert_to(jsonb_build_object('cmd',cmd,'event',event_id,'version',expected_version,'input',input)::text,'UTF8')),'hex');
 select * into oldop from sontu_private.operations where id=operation_id;
 if found then
  if oldop.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
  if oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
  if oldop.target_id is not null and not exists(select 1 from sontu_private.event_instances where id=oldop.target_id and host_owner_user_id=actor) then return sontu_private.fail('UNAUTHORIZED'); end if;
  return case when cmd in ('issue_link','invite_participant') then oldop.result||jsonb_build_object('token',input->>'token') else oldop.result end;
 end if;
 if cmd='create_draft' then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(input->>'timezone','UTC')) then return sontu_private.fail('INVALID_INPUT'); end if;
  insert into sontu_private.event_instances(host_owner_user_id,event_kind) values(actor,'SIMPLE') returning * into e;
  insert into sontu_private.event_versions(event_instance_id,version_number,title,description,starts_at,ends_at,timezone,venue_label,materiality_class,created_by)
  values(e.id,1,'','',null,null,coalesce(input->>'timezone','UTC'),'','INITIAL',actor) returning * into v;
 elsif cmd='create_fixture' then
  insert into sontu_private.event_instances(host_owner_user_id) values(actor) returning * into e;
  insert into sontu_private.event_versions(event_instance_id,version_number,title,description,starts_at,ends_at,materiality_class,created_by)
  values(e.id,1,'Wednesday Community Dinner','A relaxed evening of food and good company.','2026-09-16 19:00:00-04','2026-09-16 21:00:00-04','INITIAL',actor) returning * into v;
  insert into sontu_private.event_participants(event_instance_id,display_name)
  select e.id,'Guest '||lpad(n::text,2,'0') from generate_series(1,12) n;
 else
  select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=actor for update;
  if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  if expected_version is distinct from e.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if;
  select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
  if cmd='save_draft' then
   if e.lifecycle<>'DRAFT' or e.event_kind<>'SIMPLE' then return sontu_private.fail('INVALID_STATE'); end if;
   if not sontu_private.valid_draft(input) then return sontu_private.fail('INVALID_INPUT'); end if;
   insert into sontu_private.event_versions(event_instance_id,version_number,prior_version_id,title,description,starts_at,ends_at,timezone,venue_label,cover_key,capacity,materiality_class,created_by)
   values(e.id,e.current_version_number+1,v.id,trim(coalesce(input->>'title','')),coalesce(input->>'description',''),nullif(input->>'starts_at','')::timestamptz,nullif(input->>'ends_at','')::timestamptz,input->>'timezone',trim(coalesce(input->>'venue_label','')),input->>'cover_key',nullif(input->>'capacity','')::integer,'INITIAL',actor);
   update sontu_private.event_instances set current_version_number=current_version_number+1,updated_at=now() where id=e.id returning * into e;
  elsif cmd='publish' then
   if e.event_kind='SIMPLE' and (input->>'confirmed' is distinct from 'true' or length(trim(v.title))=0 or length(trim(v.venue_label))=0 or v.starts_at is null or v.ends_at is null or v.starts_at<=now()) then return sontu_private.fail('PUBLISH_BLOCKED'); end if;
   if e.lifecycle<>'DRAFT' then return sontu_private.fail('INVALID_STATE'); end if;
   update sontu_private.event_instances set lifecycle='PUBLISHED',updated_at=now() where id=e.id;
  elsif cmd in ('change_time','cosmetic_edit') then
   if e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_STATE'); end if;
   if cmd='change_time' and input->>'confirmed' is distinct from 'true' then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
   newstart := case when cmd='change_time' then (input->>'starts_at')::timestamptz else v.starts_at end;
   newdesc := case when cmd='cosmetic_edit' then input->>'description' else v.description end;
   if newstart is null or newstart>=v.ends_at or newdesc is null or length(newdesc)>2000 or (cmd='change_time' and newstart=v.starts_at) then return sontu_private.fail('INVALID_INPUT'); end if;
   insert into sontu_private.event_versions(event_instance_id,version_number,prior_version_id,title,description,starts_at,ends_at,timezone,venue_label,cover_key,capacity,materiality_class,created_by)
   values(e.id,e.current_version_number+1,v.id,v.title,newdesc,newstart,v.ends_at,v.timezone,v.venue_label,v.cover_key,v.capacity,case when cmd='change_time' then 'MATERIAL' else 'COSMETIC' end,actor) returning id into nv;
   update sontu_private.event_instances set current_version_number=current_version_number+1,updated_at=now() where id=e.id returning * into e;
   if cmd='change_time' then
    select count(*) into count_affected from sontu_private.event_participants where event_instance_id=e.id and commitment_state='CONFIRMED';
    insert into sontu_private.material_changes(event_instance_id,prior_event_version_id,new_event_version_id,suggestion_state)
    values(e.id,v.id,nv,case when count_affected>0 then 'SUGGESTED' else 'NONE' end) returning id into mc;
    select * into c from sontu_private.consequence_cases where event_instance_id=e.id order by created_at desc,id desc limit 1;
    -- Existing accepted responsibility survives a material revision; terminal history stays immutable.
    if found and c.disposition<>'SUPERSEDED' and count_affected>0 then
     prior_case:=c.id;
     if c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL') then
      update sontu_private.consequence_cases set disposition='SUPERSEDED',row_version=row_version+1 where id=c.id;
     end if;
     insert into sontu_private.consequence_cases(event_instance_id,applicable_event_version_id,predecessor_case_id)
     values(e.id,nv,prior_case) returning id into cid;
     insert into sontu_private.participant_reconfirmations(event_participant_id,consequence_case_id,applicable_event_version_id)
     select id,cid,nv from sontu_private.event_participants where event_instance_id=e.id and commitment_state='CONFIRMED';
     update sontu_private.material_changes set suggestion_state='ACCEPTED' where id=mc;
    end if;
    insert into sontu_private.communication_records(event_instance_id,material_change_id,participant_id)
    select e.id,mc,id from sontu_private.event_participants where event_instance_id=e.id and commitment_state='CONFIRMED';
    insert into sontu_private.outbox_entries(event_instance_id,communication_id)
    select e.id,id from sontu_private.communication_records where material_change_id=mc;
   end if;
  elsif cmd in ('accept','dismiss') then
   if e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_STATE'); end if;
   select id into mc from sontu_private.material_changes where event_instance_id=e.id and suggestion_state='SUGGESTED' order by created_at desc,id desc limit 1;
   if mc is null then return sontu_private.fail('INVALID_STATE'); end if;
   -- Suggestions belong to the latest material facts; cosmetic revisions do not invalidate them.
   if exists(select 1 from sontu_private.material_changes where event_instance_id=e.id and created_at>(select created_at from sontu_private.material_changes where id=mc)) then return sontu_private.fail('STALE_CONFLICT'); end if;
   if input->>'confirmed' is distinct from 'true' then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
   if cmd='accept' then
    insert into sontu_private.consequence_cases(event_instance_id,applicable_event_version_id)
    values(e.id,(select new_event_version_id from sontu_private.material_changes where id=mc)) returning id into cid;
    insert into sontu_private.participant_reconfirmations(event_participant_id,consequence_case_id,applicable_event_version_id)
    select ep.id,cid,cc.applicable_event_version_id from sontu_private.event_participants ep cross join sontu_private.consequence_cases cc where ep.event_instance_id=e.id and ep.commitment_state='CONFIRMED' and cc.id=cid;
   elsif length(trim(coalesce(input->>'reason','')))=0 then return sontu_private.fail('INVALID_INPUT'); end if;
   update sontu_private.material_changes set suggestion_state=case when cmd='accept' then 'ACCEPTED' else 'DISMISSED' end,reason=left(input->>'reason',500) where id=mc;
  elsif cmd in ('waive','exception') then
   select * into c from sontu_private.consequence_cases where id=(input->>'case_id')::uuid and event_instance_id=e.id for update;
   if not found or c.disposition not in ('OPEN_UNRESOLVED','PENDING_EXTERNAL') then return sontu_private.fail('INVALID_STATE'); end if;
   if c.row_version is distinct from (input->>'row_version')::integer then return sontu_private.fail('STALE_CONFLICT'); end if;
   if input->>'confirmed' is distinct from 'true' then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
   if length(trim(coalesce(input->>'reason','')))=0 or (cmd='waive' and not c.waivable) then return sontu_private.fail('INVALID_INPUT'); end if;
   update sontu_private.consequence_cases set disposition=case when cmd='waive' then 'WAIVED' else 'EXCEPTION' end,reason=left(input->>'reason',500),row_version=row_version+1 where id=c.id;
  elsif cmd='cancel' then
   if e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_STATE'); end if;
   if input->>'confirmed' is distinct from 'true' then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
   update sontu_private.event_instances set lifecycle='CANCELLED',updated_at=now() where id=e.id;
  elsif cmd='issue_link' then
   select * into p from sontu_private.event_participants where id=(input->>'participant_id')::uuid and event_instance_id=e.id;
   if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
   token:=input->>'token';
   if token is null or token !~ '^[0-9a-f]{64}$' then return sontu_private.fail('INVALID_INPUT'); end if;
   update sontu_private.event_participants set token_hash=sha256(convert_to(token,'UTF8')),token_expires_at=now()+interval '14 days',token_revoked_at=null where id=p.id;
  elsif cmd='revoke_link' then
   update sontu_private.event_participants set token_revoked_at=now() where id=(input->>'participant_id')::uuid and event_instance_id=e.id;
   if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
  elsif cmd='invite_participant' then
   if e.event_kind<>'SIMPLE' or e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_STATE'); end if;
   if length(trim(coalesce(input->>'display_name',''))) not between 1 and 80 or length(coalesce(input->>'email',''))>254 or coalesce(input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or coalesce(input->>'token','') !~ '^[0-9a-f]{64}$' then return sontu_private.fail('INVALID_INPUT'); end if;
   if exists(select 1 from sontu_private.event_participants where event_instance_id=e.id and invitation_email=lower(trim(input->>'email'))) then return sontu_private.fail('ALREADY_INVITED'); end if;
   token:=input->>'token';
   insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,invitation_state,token_hash,token_expires_at)
   values(e.id,trim(input->>'display_name'),'NO_COMMITMENT',lower(trim(input->>'email')),'CREATED',sha256(convert_to(token,'UTF8')),now()+interval '30 days');
  elsif cmd='simulate_provider' then
   -- Only owner may invoke this bounded synthetic adapter. It cannot supply real provider evidence.
   if input->>'provider_status' is null or input->>'provider_status' not in ('CONFIRMED','UNKNOWN','PENDING','FAILED','STALE') or length(coalesce(input->>'evidence_id','')) not between 1 and 100 then return sontu_private.fail('INVALID_INPUT'); end if;
   provtime:=(input->>'authoritative_at')::timestamptz;
   if provtime is null or provtime>clock_timestamp()+interval '1 minute' then return sontu_private.fail('INVALID_INPUT'); end if;
   select * into ev_existing from sontu_private.evidence_records where event_instance_id=e.id and source_kind='SIMULATED_PROVIDER' and source_ref='resource-a' and external_evidence_id=input->>'evidence_id';
   if found then
    if ev_existing.observed_status<>input->>'provider_status' or ev_existing.authoritative_at<>provtime or ev_existing.applicable_event_version_id<>v.id then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
   else
    insert into sontu_private.evidence_records(event_instance_id,applicable_event_version_id,source_kind,source_ref,external_evidence_id,observed_status,authoritative_at,is_simulated)
    values(e.id,v.id,'SIMULATED_PROVIDER','resource-a',input->>'evidence_id',input->>'provider_status',provtime,true);
   end if;
  elsif cmd='simulate_delivery' then
   if input->>'delivery_status' is null or input->>'delivery_status' not in ('DELIVERED','FAILED') then return sontu_private.fail('INVALID_INPUT'); end if;
   update sontu_private.outbox_entries set state=input->>'delivery_status',attempt_count=attempt_count+1 where event_instance_id=e.id and state<>'DELIVERED';
   update sontu_private.communication_records cr set dispatch_state=o.state from sontu_private.outbox_entries o where o.communication_id=cr.id and o.event_instance_id=e.id;
  else return sontu_private.fail('INVALID_INPUT'); end if;
 end if;
 result:=jsonb_build_object('status','ready','operation_id',operation_id,'event_id',e.id,'current_version',e.current_version_number);
 if token is not null then result:=result||jsonb_build_object('token',token); end if;
 insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result) values(operation_id,actor::text,cmd,e.id,fingerprint,result-'token');
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
 values(e.id,operation_id,actor::text,cmd,jsonb_build_object('expected_version',expected_version,'current_version',e.current_version_number,'confirmed',input->'confirmed','reason',left(input->>'reason',500),'is_simulated',cmd like 'simulate_%','predecessor_case_id',prior_case));
 return result;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 return sontu_private.fail('INVALID_INPUT');
end $$;


create or replace function sontu_private.host_projection(event_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sontu_private.event_instances; v sontu_private.event_versions; cid uuid;
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if event_id is null then
  return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',ev.title,'lifecycle',i.lifecycle,'starts_at',ev.starts_at,'timezone',ev.timezone,'cover_key',ev.cover_key,'event_kind',i.event_kind,'updated_at',i.updated_at) order by i.created_at desc) from sontu_private.event_instances i join sontu_private.event_versions ev on ev.event_instance_id=i.id and ev.version_number=i.current_version_number where i.host_owner_user_id=auth.uid()),'[]'));
 end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=auth.uid();
 if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 select id into cid from sontu_private.consequence_cases where event_instance_id=e.id order by created_at desc,id desc limit 1;
 return jsonb_build_object('status','ready','data',jsonb_build_object(
 'event',jsonb_build_object('id',e.id,'lifecycle',e.lifecycle,'current_version_number',e.current_version_number,'event_kind',e.event_kind),
 'version',to_jsonb(v)-'created_by',
 'versions',(select jsonb_agg(to_jsonb(x)-'created_by' order by version_number desc) from sontu_private.event_versions x where event_instance_id=e.id),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'commitment_state',p.commitment_state,'invitation_state',p.invitation_state,'invitation_email',p.invitation_email,'link_revoked',p.token_revoked_at is not null,'response',r.state) order by p.display_name) from sontu_private.event_participants p left join sontu_private.participant_reconfirmations r on r.event_participant_id=p.id and r.consequence_case_id=cid where p.event_instance_id=e.id),'[]'),
 'cases',coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc,id desc) from sontu_private.consequence_cases c where event_instance_id=e.id),'[]'),
 'suggestion',(select jsonb_build_object('id',m.id,'suggestion_state',m.suggestion_state) from sontu_private.material_changes m where event_instance_id=e.id order by created_at desc,id desc limit 1),
 'provider',(select to_jsonb(x) from sontu_private.evidence_records x where event_instance_id=e.id and source_kind='SIMULATED_PROVIDER' order by authoritative_at desc,received_at desc,id desc limit 1),
 'communications',coalesce((select jsonb_agg(x) from (select dispatch_state,count(*)::int as count from sontu_private.communication_records where event_instance_id=e.id group by dispatch_state) x),'[]'),
 'audit',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (select id,audit_kind,metadata,created_at from sontu_private.audit_entries where event_instance_id=e.id order by created_at desc,id desc limit 100) x),'[]')
 ));
end $$;


create function sontu_private.simple_access(token text default null,event_id uuid default null,decision text default null,expected_version integer default null,operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p sontu_private.event_participants; e sontu_private.event_instances; v sontu_private.event_versions;
 c sontu_private.consequence_cases; rr sontu_private.participant_reconfirmations; oldop sontu_private.operations;
 mail text; fingerprint text; result jsonb; confirmed_count integer;
begin
 mail:=sontu_private.verified_email();
 if mail is null then return sontu_private.fail('VERIFY_EMAIL'); end if;
 if decision is not null then
  if operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 end if;
 select * into p from sontu_private.event_participants ep where ep.invitation_email=mail and
 ((token is not null and ep.token_hash=sha256(convert_to(token,'UTF8'))) or (token is null and ep.event_instance_id=event_id));
 if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into e from sontu_private.event_instances where id=p.event_instance_id and event_kind='SIMPLE' for update;
 if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into p from sontu_private.event_participants where id=p.id and invitation_email=mail and token_revoked_at is null and token_expires_at>now() and (token is null or token_hash=sha256(convert_to(token,'UTF8')));
 if not found or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 select * into c from sontu_private.consequence_cases where event_instance_id=e.id order by created_at desc,id desc limit 1;
 select * into rr from sontu_private.participant_reconfirmations where event_participant_id=p.id and consequence_case_id=c.id;
 select count(*) into confirmed_count from sontu_private.event_participants where event_instance_id=e.id and commitment_state='CONFIRMED';
 if decision is null then
  return jsonb_build_object('status','ready','event',jsonb_build_object('id',e.id,'title',v.title,'description',v.description,'starts_at',v.starts_at,'ends_at',v.ends_at,'timezone',v.timezone,'venue_label',v.venue_label,'cover_key',v.cover_key,'lifecycle',e.lifecycle,'current_version',e.current_version_number,'responses_open',e.lifecycle='PUBLISHED' and v.starts_at>now(),'full',v.capacity is not null and confirmed_count>=v.capacity),
   'participant',jsonb_build_object('display_name',p.display_name,'commitment_state',p.commitment_state,'invitation_state',p.invitation_state,'response',rr.state,'reconfirmation_required',c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL') and rr.state='AWAITING_RESPONSE'));
 end if;
 fingerprint:=jsonb_build_object('participant',p.id,'decision',decision,'version',expected_version)::text;
 select * into oldop from sontu_private.operations where id=operation_id;
 if found then
  if oldop.actor_ref<>p.id::text or oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
  return oldop.result;
 end if;
 if expected_version is distinct from e.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if;
 if e.lifecycle<>'PUBLISHED' or v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
 if decision in ('ACCEPT_INVITE','DECLINE_INVITE') then
  if p.commitment_state<>'NO_COMMITMENT' then return sontu_private.fail('INVALID_STATE'); end if;
  if decision='ACCEPT_INVITE' and v.capacity is not null and confirmed_count>=v.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
  update sontu_private.event_participants set invitation_state=case when decision='ACCEPT_INVITE' then 'ACCEPTED' else 'DECLINED' end,
   commitment_state=case when decision='ACCEPT_INVITE' then 'CONFIRMED' else 'NO_COMMITMENT' end where id=p.id;
 elsif decision in ('WITHDRAW','RECONFIRMED','RELEASED_DECLINED') then
  if p.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;
  if decision in ('RECONFIRMED','RELEASED_DECLINED') and (rr.id is null or rr.state<>'AWAITING_RESPONSE' or c.disposition not in ('OPEN_UNRESOLVED','PENDING_EXTERNAL')) then return sontu_private.fail('INVALID_STATE'); end if;
  if decision<>'RECONFIRMED' then update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=p.id; end if;
  if rr.id is not null and rr.state='AWAITING_RESPONSE' and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL') then
   update sontu_private.participant_reconfirmations set state=case when decision='RECONFIRMED' then decision else 'RELEASED_DECLINED' end,responded_at=now() where id=rr.id;
   update sontu_private.consequence_cases set row_version=row_version+1,
    disposition=case when not exists(select 1 from sontu_private.participant_reconfirmations where consequence_case_id=c.id and state='AWAITING_RESPONSE') then 'RESOLVED' else disposition end,
    resolved_at=case when not exists(select 1 from sontu_private.participant_reconfirmations where consequence_case_id=c.id and state='AWAITING_RESPONSE') then now() else null end where id=c.id;
  end if;
 else return sontu_private.fail('INVALID_INPUT'); end if;
 insert into sontu_private.evidence_records(event_instance_id,applicable_event_version_id,source_kind,source_ref,external_evidence_id,observed_status,authoritative_at,is_simulated)
 values(e.id,v.id,'PARTICIPANT',p.id::text,operation_id::text,decision,now(),false);
 result:=jsonb_build_object('status','ready','event_id',e.id,'current_version',e.current_version_number,'operation_id',operation_id);
 insert into sontu_private.operations values(operation_id,p.id::text,'simple_response',e.id,fingerprint,result,now());
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,operation_id,p.id::text,decision,jsonb_build_object('version',e.current_version_number,'verified_user_id',auth.uid()));
 return result;
end $$;
revoke all on function sontu_private.simple_access(text,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function sontu_private.simple_access(text,uuid,text,integer,uuid) to anon,authenticated;
create function public.sontu_simple_access(token text default null,event_id uuid default null,decision text default null,expected_version integer default null,operation_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.simple_access(token,event_id,decision,expected_version,operation_id) $$;
revoke all on function public.sontu_simple_access(text,uuid,text,integer,uuid) from public;
grant execute on function public.sontu_simple_access(text,uuid,text,integer,uuid) to anon,authenticated;

-- Preserve the synthetic reconfirmation adapter; simple invitations can never bypass verified recipient access through it.
alter function sontu_private.participant_access(text,text,integer,uuid) rename to fixture_participant_access;
revoke all on function sontu_private.fixture_participant_access(text,text,integer,uuid) from anon,authenticated,public;
create function sontu_private.participant_access(token text,decision text default null,expected_version integer default null,operation_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from sontu_private.event_participants p join sontu_private.event_instances e on e.id=p.event_instance_id where p.token_hash=sha256(convert_to(token,'UTF8')) and e.event_kind='SIMPLE') then
  return sontu_private.simple_access(token,null,decision,expected_version,operation_id);
 end if;
 return sontu_private.fixture_participant_access(token,decision,expected_version,operation_id);
end $$;
revoke all on function sontu_private.participant_access(text,text,integer,uuid) from public;
grant execute on function sontu_private.participant_access(text,text,integer,uuid) to anon,authenticated;
-- Rebind wrapper after renaming the old implementation.
create or replace function public.sontu_participant_access(token text,decision text default null,expected_version integer default null,operation_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.participant_access(token,decision,expected_version,operation_id) $$;

create function sontu_private.my_events() returns jsonb language plpgsql security definer set search_path='' as $$
declare mail text:=sontu_private.verified_email();
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(x order by x.starts_at nulls last,x.id) from (
  select e.id,e.lifecycle,v.title,v.starts_at,v.timezone,v.venue_label,v.cover_key,
   e.host_owner_user_id=auth.uid() as hosting,p.commitment_state,p.invitation_state
  from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  left join sontu_private.event_participants p on p.event_instance_id=e.id and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now()
  where e.event_kind='SIMPLE' and (e.host_owner_user_id=auth.uid() or (p.id is not null and e.lifecycle<>'DRAFT'))
 ) x),'[]'));
end $$;
revoke all on function sontu_private.my_events() from public,anon;
grant execute on function sontu_private.my_events() to authenticated;
create function public.sontu_my_events() returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.my_events() $$;
revoke all on function public.sontu_my_events() from public,anon;
grant execute on function public.sontu_my_events() to authenticated;

create or replace function sontu_private.fail(code text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('status',case when code in ('UNAUTHORIZED','TOKEN_INVALID','TOKEN_EXPIRED','VERIFY_EMAIL','INVITATION_UNAVAILABLE') then 'denied' else 'error' end,'error_code',code)
$$;
