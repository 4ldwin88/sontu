-- Reviewed schedule/location updates reuse the governed material-change path.
CREATE OR REPLACE FUNCTION sontu_private.host_command(cmd text, event_id uuid, expected_version integer, operation_id uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid := auth.uid(); e sontu_private.event_instances; v sontu_private.event_versions; nv uuid;
 c sontu_private.consequence_cases; p sontu_private.event_participants; mc uuid; cid uuid; prior_case uuid;
 oldop sontu_private.operations; fingerprint text; result jsonb; token text; newstart timestamptz; newdesc text;
 count_affected integer; provtime timestamptz; ev_existing sontu_private.evidence_records;
 newend timestamptz; newvenue text;
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
  elsif cmd in ('change_time','change_schedule','cosmetic_edit') then
   if e.lifecycle<>'PUBLISHED' then return sontu_private.fail('INVALID_STATE'); end if;
   if cmd in ('change_time','change_schedule') and input->>'confirmed' is distinct from 'true' then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
   newstart := case when cmd in ('change_time','change_schedule') then (input->>'starts_at')::timestamptz else v.starts_at end;
   newend := case when cmd='change_schedule' then (input->>'ends_at')::timestamptz else v.ends_at end;
   newvenue := case when cmd='change_schedule' then trim(input->>'venue_label') else v.venue_label end;
   if cmd='change_schedule' and (e.event_kind<>'SIMPLE' or newstart is null or newend is null or not isfinite(newstart) or not isfinite(newend) or newstart<=now() or newvenue is null or length(newvenue) not between 1 and 300 or (newstart=v.starts_at and newend=v.ends_at and newvenue=v.venue_label)) then return sontu_private.fail('INVALID_INPUT'); end if;
   newdesc := case when cmd='cosmetic_edit' then input->>'description' else v.description end;
   if newstart is null or newstart>=newend or newdesc is null or length(newdesc)>2000 or (cmd='change_time' and newstart=v.starts_at) then return sontu_private.fail('INVALID_INPUT'); end if;
   insert into sontu_private.event_versions(event_instance_id,version_number,prior_version_id,title,description,starts_at,ends_at,timezone,venue_label,cover_key,capacity,materiality_class,created_by)
   values(e.id,e.current_version_number+1,v.id,v.title,newdesc,newstart,newend,v.timezone,newvenue,v.cover_key,v.capacity,case when cmd in ('change_time','change_schedule') then 'MATERIAL' else 'COSMETIC' end,actor) returning id into nv;
   update sontu_private.event_instances set current_version_number=current_version_number+1,updated_at=now() where id=e.id returning * into e;
   if cmd in ('change_time','change_schedule') then
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
end $function$;
