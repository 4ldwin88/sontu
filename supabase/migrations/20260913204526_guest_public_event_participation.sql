-- Public visibility and participation eligibility are separate host choices.
-- Guest RSVPs are event-scoped records, not shadow accounts.
alter table sontu_private.event_instances
  add column participation_access text not null default 'SONTU_USERS_ONLY'
  check (participation_access in ('ANYONE','SONTU_USERS_ONLY'));

create function sontu_private.event_participation_access(action text,event_id uuid,value text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_value text;
begin
  if auth.uid() is null or not exists(
    select 1 from sontu_private.event_instances e
    where e.id=event_participation_access.event_id and e.host_owner_user_id=auth.uid() and e.event_kind='SIMPLE'
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='write' then
    if value not in ('ANYONE','SONTU_USERS_ONLY') then return sontu_private.fail('INVALID_INPUT'); end if;
    update sontu_private.event_instances set participation_access=value,updated_at=now()
      where id=event_participation_access.event_id and lifecycle='DRAFT';
    if not found then return sontu_private.fail('INVALID_STATE'); end if;
  elsif action<>'read' then return sontu_private.fail('INVALID_INPUT'); end if;
  select participation_access into current_value from sontu_private.event_instances where id=event_participation_access.event_id;
  return jsonb_build_object('status','ready','participation_access',current_value);
end $$;
revoke all on function sontu_private.event_participation_access(text,uuid,text) from public,anon,authenticated;
grant execute on function sontu_private.event_participation_access(text,uuid,text) to authenticated;
create function public.sontu_event_participation_access(action text,event_id uuid,value text default null) returns jsonb
language sql security invoker set search_path='' as $$ select sontu_private.event_participation_access(action,event_id,value) $$;
revoke all on function public.sontu_event_participation_access(text,uuid,text) from public,anon;
grant execute on function public.sontu_event_participation_access(text,uuid,text) to authenticated;

create or replace function sontu_private.public_events(event_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status','ready','events',coalesce(jsonb_agg(x order by x.starts_at nulls last,x.id),'[]'::jsonb))
  from (
    select e.id,e.lifecycle,e.current_version_number as current_version,e.event_category as category,e.event_format as format,e.visibility,e.participation_access,
      v.title,v.description,v.starts_at,v.ends_at,v.timezone,v.venue_label,v.cover_key,v.capacity,
      false as hosting,null::text as commitment_state,null::text as invitation_state,
      ((select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='CONFIRMED')
       + (select count(*) from sontu_private.event_team_members m where m.event_instance_id=e.id and m.attends_event)
       + 1)::int as going_count,
      (select coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id) as host_name
    from sontu_private.event_instances e
    join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
    where e.event_kind='SIMPLE' and e.visibility='PUBLIC' and e.lifecycle in ('PUBLISHED','CANCELLED','CLOSED')
      and (public_events.event_id is null or e.id=public_events.event_id)
  ) x
$$;

create function sontu_private.guest_event_participation(
  event_id uuid, action text, guest_name text default null, guest_email text default null,
  expected_version integer default null, operation_id uuid default null, manage_token uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  e sontu_private.event_instances; v sontu_private.event_versions; p sontu_private.event_participants;
  oldop sontu_private.operations; confirmed_count integer; normalized_email text:=lower(trim(coalesce(guest_email,'')));
  normalized_name text:=trim(coalesce(guest_name,'')); fingerprint text; actor_ref text; result jsonb;
begin
  if action not in ('READ','JOIN','WITHDRAW') or manage_token is null then return sontu_private.fail('INVALID_INPUT'); end if;
  if action='JOIN' and (length(normalized_name) not between 1 and 120 or length(normalized_email)>254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then return sontu_private.fail('INVALID_INPUT'); end if;
  actor_ref:='guest:'||encode(sha256(convert_to(manage_token::text,'UTF8')),'hex');
  if action<>'READ' and operation_id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  if action<>'READ' then perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); end if;
  fingerprint:=jsonb_build_object('event_id',event_id,'action',action,'name',normalized_name,'email',normalized_email,'token',manage_token,'version',expected_version)::text;
  if action<>'READ' then
    select * into oldop from sontu_private.operations where id=operation_id;
    if found then
      if oldop.actor_ref<>actor_ref or oldop.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
      return oldop.result;
    end if;
  end if;
  select * into e from sontu_private.event_instances
    where id=guest_event_participation.event_id and event_kind='SIMPLE' and visibility='PUBLIC' and participation_access='ANYONE'
    for update;
  if not found or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
  select * into p from sontu_private.event_participants ep
    where ep.event_instance_id=e.id and ep.token_hash=sha256(convert_to(manage_token::text,'UTF8')) limit 1;
  select count(*) into confirmed_count from sontu_private.event_participants ep
    where ep.event_instance_id=e.id and ep.commitment_state='CONFIRMED';
  if action='READ' then
    return jsonb_build_object('status','ready','commitment_state',p.commitment_state,'display_name',p.display_name,
      'current_version',e.current_version_number,'participant_count',confirmed_count,'capacity',v.capacity,
      'full',v.capacity is not null and confirmed_count>=v.capacity,'responses_open',e.lifecycle='PUBLISHED' and v.starts_at>now());
  end if;
  if expected_version is distinct from e.current_version_number then return sontu_private.fail('STALE_CONFLICT'); end if;
  if e.lifecycle<>'PUBLISHED' or v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
  if action='JOIN' then
    if p.id is not null and p.commitment_state='CONFIRMED' then
      result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
    else
      if p.id is null and exists(select 1 from sontu_private.event_participants ep where ep.event_instance_id=e.id and lower(ep.invitation_email)=normalized_email) then
        return sontu_private.fail('EMAIL_UNAVAILABLE');
      end if;
      if v.capacity is not null and confirmed_count>=v.capacity then return sontu_private.fail('CAPACITY_FULL'); end if;
      if p.id is null then
        insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state,invitation_email,token_hash,token_expires_at)
        values(e.id,normalized_name,'CONFIRMED',normalized_email,sha256(convert_to(manage_token::text,'UTF8')),v.ends_at+interval '30 days') returning * into p;
      else
        update sontu_private.event_participants set display_name=normalized_name,invitation_email=normalized_email,commitment_state='CONFIRMED'
          where id=p.id returning * into p;
      end if;
      result:=jsonb_build_object('status','ready','commitment_state','CONFIRMED','display_name',p.display_name,'current_version',e.current_version_number);
    end if;
  else
    if p.id is null or p.commitment_state<>'CONFIRMED' then return sontu_private.fail('INVALID_STATE'); end if;
    update sontu_private.event_participants set commitment_state='RELEASED_DECLINED' where id=p.id;
    result:=jsonb_build_object('status','ready','commitment_state','RELEASED_DECLINED','display_name',p.display_name,'current_version',e.current_version_number);
  end if;
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
    values(operation_id,actor_ref,lower(action)||'_guest_event',e.id,fingerprint,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(e.id,operation_id,actor_ref,lower(action)||'_guest_event',jsonb_build_object('version',e.current_version_number,'participant_id',p.id));
  return result;
end $$;
revoke all on function sontu_private.guest_event_participation(uuid,text,text,text,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function sontu_private.guest_event_participation(uuid,text,text,text,integer,uuid,uuid) to anon,authenticated;
create function public.sontu_guest_event_participation(event_id uuid,action text,guest_name text default null,guest_email text default null,expected_version integer default null,operation_id uuid default null,manage_token uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.guest_event_participation(event_id,action,guest_name,guest_email,expected_version,operation_id,manage_token) $$;
revoke all on function public.sontu_guest_event_participation(uuid,text,text,text,integer,uuid,uuid) from public;
grant execute on function public.sontu_guest_event_participation(uuid,text,text,text,integer,uuid,uuid) to anon,authenticated;
