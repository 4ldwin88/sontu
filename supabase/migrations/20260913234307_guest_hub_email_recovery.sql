-- A lost browser credential must not strand an accountless guest. Recovery is
-- intentionally a second, short-lived event credential: it never replaces the
-- working credential before a message has actually reached the recipient.
alter table sontu_private.event_participants
  add column guest_recovery_token_hash bytea,
  add column guest_recovery_token_expires_at timestamptz,
  add column guest_recovery_requested_at timestamptz;

create function sontu_private.issue_guest_hub_recovery(event_id uuid, recipient_email text)
returns table(manage_token uuid, recipient_name text, email text, event_title text, starts_at timestamptz, timezone text, venue_label text)
language plpgsql security definer set search_path=''
as $$
declare
  p sontu_private.event_participants;
  e sontu_private.event_instances;
  v sontu_private.event_versions;
  normalized_email text:=lower(trim(coalesce(recipient_email,'')));
  issued_token uuid:=gen_random_uuid();
begin
  -- Service-only call. No result is intentionally indistinguishable from an
  -- unknown guest, an expired RSVP, or a rate-limited request.
  select ep.* into p
  from sontu_private.event_participants ep
  join sontu_private.event_instances i on i.id=ep.event_instance_id
  where ep.event_instance_id=issue_guest_hub_recovery.event_id
    and ep.participant_user_id is null
    and ep.commitment_state='CONFIRMED'
    and ep.token_revoked_at is null
    and ep.token_expires_at>now()
    and lower(ep.invitation_email)=normalized_email
    and i.event_kind='SIMPLE' and i.visibility='PUBLIC' and i.participation_access='ANYONE'
  for update of ep;
  if p.id is null or p.guest_recovery_requested_at>now()-interval '10 minutes' then return; end if;

  select * into e from sontu_private.event_instances where id=p.event_instance_id;
  select * into v from sontu_private.event_versions
    where event_instance_id=e.id and version_number=e.current_version_number;
  update sontu_private.event_participants
    set guest_recovery_token_hash=sha256(convert_to(issued_token::text,'UTF8')),
        guest_recovery_token_expires_at=least(token_expires_at,now()+interval '24 hours'),
        guest_recovery_requested_at=now()
    where id=p.id;
  insert into sontu_private.audit_entries(event_instance_id,actor_ref,audit_kind,metadata)
    values(e.id,'guest-recovery:'||encode(sha256(convert_to(normalized_email,'UTF8')),'hex'),'guest_hub_recovery_requested',jsonb_build_object('participant_id',p.id));
  return query select issued_token,p.display_name,p.invitation_email,v.title,v.starts_at,v.timezone,v.venue_label;
end $$;

create function public.sontu_issue_guest_hub_recovery(event_id uuid, recipient_email text)
returns table(manage_token uuid, recipient_name text, email text, event_title text, starts_at timestamptz, timezone text, venue_label text)
language sql security invoker set search_path=''
as $$ select * from sontu_private.issue_guest_hub_recovery(event_id,recipient_email) $$;
revoke all on function sontu_private.issue_guest_hub_recovery(uuid,text),public.sontu_issue_guest_hub_recovery(uuid,text) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
    grant execute on function public.sontu_issue_guest_hub_recovery(uuid,text) to service_role;
  end if;
end $$;

create or replace function sontu_private.guest_hub_access(event_id uuid, manage_token uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare p sontu_private.event_participants; token_digest bytea:=sha256(convert_to(manage_token::text,'UTF8'));
begin
  select * into p from sontu_private.event_participants
  where event_instance_id=guest_hub_access.event_id
    and (token_hash=token_digest or (guest_recovery_token_hash=token_digest and guest_recovery_token_expires_at>now()));
  if p.id is null or p.token_revoked_at is not null or p.token_expires_at<=now() then
    return sontu_private.fail('GUEST_ACCESS_EXPIRED');
  end if;
  return sontu_private.guest_event_participation(event_id,'READ',null,null,null,null,manage_token);
end $$;

create or replace function sontu_private.guest_event_participation(
  event_id uuid, action text, guest_name text default null, guest_email text default null,
  expected_version integer default null, operation_id uuid default null, manage_token uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  e sontu_private.event_instances; v sontu_private.event_versions; p sontu_private.event_participants;
  oldop sontu_private.operations; confirmed_count integer; normalized_email text:=lower(trim(coalesce(guest_email,'')));
  normalized_name text:=trim(coalesce(guest_name,'')); fingerprint text; actor_ref text; result jsonb; token_digest bytea:=sha256(convert_to(manage_token::text,'UTF8'));
begin
  if action not in ('READ','JOIN','WITHDRAW') or manage_token is null then return sontu_private.fail('INVALID_INPUT'); end if;
  if action='JOIN' and (length(normalized_name) not between 1 and 120 or length(normalized_email)>254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then return sontu_private.fail('INVALID_INPUT'); end if;
  actor_ref:='guest:'||encode(token_digest,'hex');
  if action<>'READ' and operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;
  fingerprint:=jsonb_build_object('event_id',event_id,'action',action,'name',normalized_name,'email',normalized_email,'token',manage_token,'version',expected_version)::text;
  if action<>'READ' then select * into oldop from sontu_private.operations where id=operation_id; if found then if oldop.actor_ref<>actor_ref or oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if; return oldop.result; end if; end if;
  select * into e from sontu_private.event_instances where id=guest_event_participation.event_id and event_kind='SIMPLE' and visibility='PUBLIC' and participation_access='ANYONE' for update;
  if not found or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
  select * into p from sontu_private.event_participants ep where ep.event_instance_id=e.id and (ep.token_hash=token_digest or (ep.guest_recovery_token_hash=token_digest and ep.guest_recovery_token_expires_at>now())) limit 1;
  select count(*) into confirmed_count from sontu_private.event_participants ep where ep.event_instance_id=e.id and ep.commitment_state='CONFIRMED';
  if action='READ' then return jsonb_build_object('status','ready','commitment_state',p.commitment_state,'display_name',p.display_name,'current_version',e.current_version_number,'participant_count',confirmed_count,'capacity',v.capacity,'full',v.capacity is not null and confirmed_count>=v.capacity,'responses_open',e.lifecycle='PUBLISHED' and v.starts_at>now()); end if;
  if expected_version is distinct from e.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if;
  if e.lifecycle<>'PUBLISHED' or v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
  if action='JOIN' then
    if p.id is not null and p.commitment_state='CONFIRMED' then result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
    else
      if p.id is null and exists(select 1 from sontu_private.event_participants ep where ep.event_instance_id=e.id and lower(ep.invitation_email)=normalized_email) then return sontu_private.fail('EMAIL_UNAVAILABLE'); end if;
      if v.capacity is not null and confirmed_count>=v.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      if p.id is null then insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,token_hash,token_expires_at) values(e.id,normalized_name,'CONFIRMED',normalized_email,token_digest,v.ends_at+interval '30 days') returning * into p;
      else update sontu_private.event_participants set display_name=normalized_name,invitation_email=normalized_email,commitment_state='CONFIRMED' where id=p.id returning * into p; end if;
      result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
    end if;
  else
    if p.id is null or p.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;
    update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=p.id;
    result:=jsonb_build_object('status','ready','commitment_state','RELEASED_DECLINED','display_name',p.display_name,'current_version',e.current_version_number);
  end if;
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result) values(operation_id,actor_ref,lower(action)||'_guest_event',e.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,operation_id,actor_ref,lower(action)||'_guest_event',jsonb_build_object('version',e.current_version_number,'participant_id',p.id));
  return result;
end $$;
