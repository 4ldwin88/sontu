-- An unlisted event is discoverable only by its direct event link. It is not
-- private: the configured participation access still governs its RSVP path.
alter table sontu_private.event_instances
  drop constraint event_instances_visibility_check;
alter table sontu_private.event_instances
  add constraint event_instances_visibility_check
  check (visibility in ('PUBLIC','UNLISTED','PRIVATE'));

create or replace function sontu_private.event_visibility(action text,event_id uuid,value text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_value text;
begin
  if auth.uid() is null or not exists(select 1 from sontu_private.event_instances e where e.id=event_visibility.event_id and e.host_owner_user_id=auth.uid() and e.event_kind='SIMPLE') then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='write' then
    if value not in ('PUBLIC','UNLISTED','PRIVATE') then return sontu_private.fail('INVALID_INPUT'); end if;
    update sontu_private.event_instances set visibility=value,updated_at=now() where id=event_visibility.event_id and lifecycle='DRAFT';
    if not found then return sontu_private.fail('INVALID_STATE'); end if;
  elsif action<>'read' then return sontu_private.fail('INVALID_INPUT'); end if;
  select visibility into current_value from sontu_private.event_instances where id=event_visibility.event_id;
  return jsonb_build_object('status','ready','visibility',current_value);
end $$;

-- List requests return only public events; direct-ID reads may return unlisted
-- events. A UUID link is presentation routing, never authorization by itself.
create or replace function sontu_private.public_events(event_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status','ready','events',coalesce(jsonb_agg(x order by x.starts_at nulls last,x.id),'[]'::jsonb))
  from (
    select e.id,e.lifecycle,e.current_version_number as current_version,e.event_category as category,e.event_format as format,e.visibility,e.participation_access,
      v.title,v.description,v.starts_at,v.ends_at,v.timezone,v.venue_label,v.cover_key,v.capacity,
      false as hosting,null::text as commitment_state,null::text as invitation_state,
      ((select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='CONFIRMED') + (select count(*) from sontu_private.event_team_members m where m.event_instance_id=e.id and m.attends_event) + 1)::int as going_count,
      (select coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id) as host_name
    from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
    where e.event_kind='SIMPLE' and e.lifecycle in ('PUBLISHED','IN_PROGRESS','CANCELLED','COMPLETED')
      and (e.visibility='PUBLIC' or (public_events.event_id is not null and e.visibility='UNLISTED' and e.id=public_events.event_id))
      and (public_events.event_id is null or e.id=public_events.event_id)
  ) x
$$;

create or replace function sontu_private.public_event_participation(event_id uuid,action text default 'READ',expected_version integer default null,operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); mail text:=sontu_private.verified_email(); event_row sontu_private.event_instances; version_row sontu_private.event_versions; participant sontu_private.event_participants; prior_operation sontu_private.operations; participant_count integer; total_going integer; display text; fingerprint text; result jsonb;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if; if mail is null then return sontu_private.fail('VERIFY_EMAIL'); end if;
 if action not in ('READ','JOIN','WITHDRAW') then return sontu_private.fail('INVALID_INPUT'); end if; if action<>'READ' and operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if; if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;
 fingerprint:=jsonb_build_object('actor',actor,'event_id',event_id,'action',action,'version',expected_version)::text;
 if action<>'READ' then select * into prior_operation from sontu_private.operations where id=operation_id; if found then if prior_operation.actor_ref<>actor::text or prior_operation.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if; return prior_operation.result; end if; end if;
 select * into event_row from sontu_private.event_instances where id=public_event_participation.event_id and event_kind='SIMPLE' and visibility in ('PUBLIC','UNLISTED') for update;
 if not found or event_row.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into version_row from sontu_private.event_versions where event_instance_id=event_row.id and version_number=event_row.current_version_number;
 select * into participant from sontu_private.event_participants p where p.event_instance_id=event_row.id and (p.participant_user_id=actor or lower(p.invitation_email)=mail) order by (p.participant_user_id=actor) desc limit 1;
 select count(*) into participant_count from sontu_private.event_participants p where p.event_instance_id=event_row.id and p.commitment_state='CONFIRMED'; select participant_count + 1 + count(*) into total_going from sontu_private.event_team_members m where m.event_instance_id=event_row.id and m.attends_event;
 if action='READ' then return jsonb_build_object('status','ready','commitment_state',participant.commitment_state,'current_version',event_row.current_version_number,'participant_count',participant_count,'going_count',total_going,'capacity',version_row.capacity,'full',version_row.capacity is not null and participant_count>=version_row.capacity,'responses_open',event_row.lifecycle='PUBLISHED' and version_row.starts_at>now()); end if;
 if expected_version is distinct from event_row.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if; if event_row.lifecycle<>'PUBLISHED' or version_row.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if; if event_row.host_owner_user_id=actor then return sontu_private.fail('INVALID_STATE'); end if;
 if action='JOIN' then
  if participant.id is not null and participant.commitment_state='CONFIRMED' then result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
  else
   if version_row.capacity is not null and participant_count>=version_row.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
   select coalesce(nullif(p.display_name,''),p.first_name,split_part(mail,'@',1)) into display from sontu_private.account_profiles p where p.user_id=actor; display:=coalesce(display,split_part(mail,'@',1));
   if participant.id is null then insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,invitation_state,participant_user_id) values(event_row.id,display,'CONFIRMED',mail,null,actor) returning * into participant;
   else update sontu_private.event_participants set participant_user_id=actor,display_name=display,commitment_state='CONFIRMED',invitation_state=case when invitation_state is null then null else 'ACCEPTED' end where id=participant.id returning * into participant; end if;
   result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
  end if;
 else
  if participant.id is null or participant.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if; update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=participant.id; result:=jsonb_build_object('status','ready','event_id',event_row.id,'current_version',event_row.current_version_number,'operation_id',operation_id);
 end if;
 insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result) values(operation_id,actor::text,lower(action)||'_public_event',event_row.id,fingerprint,result); insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_row.id,operation_id,actor::text,lower(action)||'_public_event',jsonb_build_object('version',event_row.current_version_number,'participant_id',participant.id)); return result;
end $$;

create or replace function sontu_private.guest_event_participation(event_id uuid,action text,guest_name text default null,guest_email text default null,expected_version integer default null,operation_id uuid default null,manage_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sontu_private.event_instances; v sontu_private.event_versions; p sontu_private.event_participants; oldop sontu_private.operations; confirmed_count integer; normalized_email text:=lower(trim(coalesce(guest_email,''))); normalized_name text:=trim(coalesce(guest_name,'')); fingerprint text; actor_ref text; result jsonb; token_digest bytea:=sha256(convert_to(manage_token::text,'UTF8'));
begin
 if action not in ('READ','JOIN','WITHDRAW') or manage_token is null then return sontu_private.fail('INVALID_INPUT'); end if;
 if action='JOIN' and (length(normalized_name) not between 1 and 120 or length(normalized_email)>254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then return sontu_private.fail('INVALID_INPUT'); end if;
 actor_ref:='guest:'||encode(token_digest,'hex'); if action<>'READ' and operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if; if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;
 fingerprint:=jsonb_build_object('event_id',event_id,'action',action,'name',normalized_name,'email',normalized_email,'token',manage_token,'version',expected_version)::text;
 if action<>'READ' then select * into oldop from sontu_private.operations where id=operation_id; if found then if oldop.actor_ref<>actor_ref or oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if; return oldop.result; end if; end if;
 select * into e from sontu_private.event_instances where id=guest_event_participation.event_id and event_kind='SIMPLE' and visibility in ('PUBLIC','UNLISTED') and participation_access='ANYONE' for update;
 if not found or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number; select * into p from sontu_private.event_participants ep where ep.event_instance_id=e.id and (ep.token_hash=token_digest or (ep.guest_recovery_token_hash=token_digest and ep.guest_recovery_token_expires_at>now())) limit 1; select count(*) into confirmed_count from sontu_private.event_participants ep where ep.event_instance_id=e.id and ep.commitment_state='CONFIRMED';
 if action='READ' then return jsonb_build_object('status','ready','commitment_state',p.commitment_state,'display_name',p.display_name,'current_version',e.current_version_number,'participant_count',confirmed_count,'capacity',v.capacity,'full',v.capacity is not null and confirmed_count>=v.capacity,'responses_open',e.lifecycle='PUBLISHED' and v.starts_at>now()); end if;
 if expected_version is distinct from e.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if; if e.lifecycle<>'PUBLISHED' or v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
 if action='JOIN' then
  if p.id is not null and p.commitment_state='CONFIRMED' then result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
  else
   if p.id is null and exists(select 1 from sontu_private.event_participants ep where ep.event_instance_id=e.id and lower(ep.invitation_email)=normalized_email) then return sontu_private.fail('EMAIL_UNAVAILABLE'); end if; if v.capacity is not null and confirmed_count>=v.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
   if p.id is null then insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,token_hash,token_expires_at) values(e.id,normalized_name,'CONFIRMED',normalized_email,token_digest,v.ends_at+interval '30 days') returning * into p; else update sontu_private.event_participants set display_name=normalized_name,invitation_email=normalized_email,commitment_state='CONFIRMED' where id=p.id returning * into p; end if;
   result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
  end if;
 else
  if p.id is null or p.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if; update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=p.id; result:=jsonb_build_object('status','ready','commitment_state','RELEASED_DECLINED','display_name',p.display_name,'current_version',e.current_version_number);
 end if;
 insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result) values(operation_id,actor_ref,lower(action)||'_guest_event',e.id,fingerprint,result); insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,operation_id,actor_ref,lower(action)||'_guest_event',jsonb_build_object('version',e.current_version_number,'participant_id',p.id)); return result;
end $$;

create or replace function sontu_private.issue_guest_hub_recovery(event_id uuid,recipient_email text)
returns table(manage_token uuid, recipient_name text, email text, event_title text, starts_at timestamptz, timezone text, venue_label text)
language plpgsql security definer set search_path='' as $$
declare p sontu_private.event_participants; e sontu_private.event_instances; v sontu_private.event_versions; normalized_email text:=lower(trim(coalesce(recipient_email,''))); issued_token uuid:=gen_random_uuid();
begin
 select ep.* into p from sontu_private.event_participants ep join sontu_private.event_instances i on i.id=ep.event_instance_id where ep.event_instance_id=issue_guest_hub_recovery.event_id and ep.participant_user_id is null and ep.commitment_state='CONFIRMED' and ep.token_revoked_at is null and ep.token_expires_at>now() and lower(ep.invitation_email)=normalized_email and i.event_kind='SIMPLE' and i.visibility in ('PUBLIC','UNLISTED') and i.participation_access='ANYONE' for update of ep;
 if p.id is null or p.guest_recovery_requested_at>now()-interval '10 minutes' then return; end if;
 select * into e from sontu_private.event_instances where id=p.event_instance_id; select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 update sontu_private.event_participants set guest_recovery_token_hash=sha256(convert_to(issued_token::text,'UTF8')),guest_recovery_token_expires_at=least(token_expires_at,now()+interval '24 hours'),guest_recovery_requested_at=now() where id=p.id;
 insert into sontu_private.audit_entries(event_instance_id,actor_ref,audit_kind,metadata) values(e.id,'guest-recovery:'||encode(sha256(convert_to(normalized_email,'UTF8')),'hex'),'guest_hub_recovery_requested',jsonb_build_object('participant_id',p.id));
 return query select issued_token,p.display_name,p.invitation_email,v.title,v.starts_at,v.timezone,v.venue_label;
end $$;
