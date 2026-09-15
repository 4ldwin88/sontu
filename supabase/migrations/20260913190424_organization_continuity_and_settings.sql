alter table sontu_private.organizations
  add column lifecycle text not null default 'SETUP_INCOMPLETE'
    check(lifecycle in ('SETUP_INCOMPLETE','ACTIVE','CONTINUITY_ACTION_REQUIRED','RETIRED')),
  add column retired_at timestamptz;

-- Organizations created before the continuity rule keep operating, but their
-- missing plan is explicit until an accepted successor is recorded.
update sontu_private.organizations set lifecycle='CONTINUITY_ACTION_REQUIRED';

create table sontu_private.organization_successor_nominations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references sontu_private.organizations(id),
  nominee_user_id uuid not null references auth.users(id),
  nominated_by uuid not null references auth.users(id),
  priority smallint not null check(priority between 1 and 10),
  status text not null default 'PENDING'
    check(status in ('PENDING','ACCEPTED','DECLINED','WITHDRAWN','REVOKED')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,nominee_user_id),
  unique(organization_id,priority),
  check(nominee_user_id<>nominated_by)
);
create index organization_successors_nominee_status
  on sontu_private.organization_successor_nominations(nominee_user_id,status);
alter table sontu_private.organization_successor_nominations enable row level security;
revoke all on sontu_private.organization_successor_nominations from public,anon,authenticated;

create or replace function sontu_private.organization_setup(input jsonb,operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); nominee uuid;
  prior sontu_private.operations;
  fingerprint text;
  organization sontu_private.organizations;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if operation_id is null or jsonb_typeof(input)<>'object'
    or length(trim(coalesce(input->>'display_name',''))) not between 1 and 160
    or coalesce(input->>'organization_type','') not in ('BUSINESS','NONPROFIT','COMMUNITY','VENUE','EDUCATION','GOVERNMENT','OTHER')
    or coalesce(input->>'visibility','') not in ('PUBLIC','PRIVATE')
    or length(coalesce(input->>'description',''))>500
    or length(trim(coalesce(input->>'successor_email',''))) not between 3 and 254 then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  select id into nominee from auth.users
    where lower(email)=lower(trim(input->>'successor_email')) and email_confirmed_at is not null;
  if nominee is null then return sontu_private.fail('ACCOUNT_NOT_FOUND'); end if;
  if nominee=actor then return sontu_private.fail('SELF_SUCCESSOR'); end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(input::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;
  insert into sontu_private.organizations(display_name,organization_type,description,visibility,created_by,lifecycle)
  values(trim(input->>'display_name'),input->>'organization_type',trim(coalesce(input->>'description','')),input->>'visibility',actor,'SETUP_INCOMPLETE')
  returning * into organization;
  insert into sontu_private.organization_memberships(organization_id,user_id,role)
  values(organization.id,actor,'OWNER');
  insert into sontu_private.organization_successor_nominations(organization_id,nominee_user_id,nominated_by,priority)
  values(organization.id,nominee,actor,1);
  result:=jsonb_build_object('status','ready','organization',jsonb_build_object(
    'id',organization.id,'display_name',organization.display_name,'role','OWNER','member_count',1,
    'organization_type',organization.organization_type,'description',organization.description,
    'visibility',organization.visibility,'lifecycle',organization.lifecycle,
    'successor_status','PENDING'));
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'organization_setup',organization.id,fingerprint,result);
  return result;
end
$$;

create function sontu_private.organization_governance(
  action text,
  organization_id uuid default null,
  input jsonb default '{}'::jsonb,
  operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); actor_role text; nominee uuid; current_status text;
  prior sontu_private.operations; fingerprint text; result jsonb;
  organization sontu_private.organizations;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='overview' then
    return jsonb_build_object('status','ready',
      'organizations',coalesce((select jsonb_agg(jsonb_build_object(
        'id',o.id,'display_name',o.display_name,'organization_type',o.organization_type,
        'description',o.description,'visibility',o.visibility,'lifecycle',o.lifecycle,
        'role',m.role,'accepted_successor_count',(select count(*) from sontu_private.organization_successor_nominations n where n.organization_id=o.id and n.status='ACCEPTED')
      ) order by o.display_name) from sontu_private.organization_memberships m
        join sontu_private.organizations o on o.id=m.organization_id
        where m.user_id=actor and m.status='ACTIVE'),'[]'::jsonb),
      'requests',coalesce((select jsonb_agg(jsonb_build_object(
        'id',n.id,'organization_id',n.organization_id,'organization_name',o.display_name,
        'priority',n.priority,'status',n.status,'nominated_by',n.nominated_by
      ) order by n.created_at) from sontu_private.organization_successor_nominations n
        join sontu_private.organizations o on o.id=n.organization_id
        where n.nominee_user_id=actor and n.status='PENDING'),'[]'::jsonb));
  end if;
  select m.role into actor_role from sontu_private.organization_memberships m
    where m.organization_id=organization_governance.organization_id and m.user_id=actor and m.status='ACTIVE';
  if action='detail' then
    if actor_role is null then return sontu_private.fail('UNAUTHORIZED'); end if;
    select * into organization from sontu_private.organizations o where o.id=organization_governance.organization_id;
    return jsonb_build_object('status','ready','organization',jsonb_build_object(
      'id',organization.id,'display_name',organization.display_name,'organization_type',organization.organization_type,
      'description',organization.description,'visibility',organization.visibility,'lifecycle',organization.lifecycle,
      'role',actor_role,'can_edit',actor_role in ('OWNER','ADMIN'),'can_govern',actor_role='OWNER'),
      'successors',case when actor_role='OWNER' then coalesce((select jsonb_agg(jsonb_build_object(
        'id',n.id,'user_id',n.nominee_user_id,'email',u.email,
        'display_name',coalesce(nullif(p.display_name,''),p.first_name,split_part(u.email,'@',1)),
        'priority',n.priority,'status',n.status,'accepted_at',n.accepted_at
      ) order by n.priority) from sontu_private.organization_successor_nominations n
        join auth.users u on u.id=n.nominee_user_id
        left join sontu_private.account_profiles p on p.user_id=n.nominee_user_id
        where n.organization_id=organization.id and n.status in ('PENDING','ACCEPTED')),'[]'::jsonb) else '[]'::jsonb end);
  end if;
  if action='respond_successor' then
    if operation_id is null or input->>'decision' not in ('ACCEPT','DECLINE') then return sontu_private.fail('INVALID_INPUT'); end if;
    select status into current_status from sontu_private.organization_successor_nominations n
      where n.organization_id=organization_governance.organization_id and n.nominee_user_id=actor;
    if current_status is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  elsif actor_role is null then return sontu_private.fail('UNAUTHORIZED');
  elsif action in ('update','nominate_successor') and actor_role not in ('OWNER','ADMIN') then return sontu_private.fail('UNAUTHORIZED');
  elsif action in ('revoke_successor','retire') and actor_role<>'OWNER' then return sontu_private.fail('UNAUTHORIZED');
  elsif operation_id is null then return sontu_private.fail('INVALID_INPUT');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',action,'organization_id',organization_id,'input',input)::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;
  select * into organization from sontu_private.organizations o where o.id=organization_governance.organization_id for update;
  if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  if action='update' then
    if organization.lifecycle='RETIRED'
      or length(trim(coalesce(input->>'display_name',''))) not between 1 and 160
      or coalesce(input->>'organization_type','') not in ('BUSINESS','NONPROFIT','COMMUNITY','VENUE','EDUCATION','GOVERNMENT','OTHER')
      or coalesce(input->>'visibility','') not in ('PUBLIC','PRIVATE')
      or length(coalesce(input->>'description',''))>500 then return sontu_private.fail('INVALID_INPUT'); end if;
    update sontu_private.organizations set display_name=trim(input->>'display_name'),organization_type=input->>'organization_type',
      description=trim(coalesce(input->>'description','')),visibility=input->>'visibility',updated_at=now()
      where id=organization.id;
    result:=jsonb_build_object('status','ready');
  elsif action='nominate_successor' then
    if actor_role<>'OWNER' or organization.lifecycle='RETIRED' then return sontu_private.fail('UNAUTHORIZED'); end if;
    select id into nominee from auth.users where lower(email)=lower(trim(input->>'email')) and email_confirmed_at is not null;
    if nominee is null then return sontu_private.fail('ACCOUNT_NOT_FOUND'); end if;
    if nominee=actor then return sontu_private.fail('SELF_SUCCESSOR'); end if;
    begin
      insert into sontu_private.organization_successor_nominations(organization_id,nominee_user_id,nominated_by,priority,status,accepted_at)
      values(organization.id,nominee,actor,coalesce((input->>'priority')::smallint,1),'PENDING',null)
      on conflict(organization_id,nominee_user_id) do update set priority=excluded.priority,status='PENDING',accepted_at=null,updated_at=now();
    exception when unique_violation or check_violation then return sontu_private.fail('INVALID_INPUT'); end;
    result:=jsonb_build_object('status','ready');
  elsif action='respond_successor' then
    if current_status<>'PENDING' then return sontu_private.fail('INVALID_STATE'); end if;
    update sontu_private.organization_successor_nominations n
      set status=case input->>'decision' when 'ACCEPT' then 'ACCEPTED' else 'DECLINED' end,
          accepted_at=case when input->>'decision'='ACCEPT' then now() else null end,updated_at=now()
      where n.organization_id=organization.id and n.nominee_user_id=actor and n.status='PENDING';
    if input->>'decision'='ACCEPT' then
      update sontu_private.organizations set lifecycle='ACTIVE',updated_at=now()
        where id=organization.id and lifecycle in ('SETUP_INCOMPLETE','CONTINUITY_ACTION_REQUIRED');
    end if;
    result:=jsonb_build_object('status','ready','decision',input->>'decision');
  elsif action='revoke_successor' then
    select n.status into current_status from sontu_private.organization_successor_nominations n
      where n.id=(input->>'nomination_id')::uuid and n.organization_id=organization.id;
    if current_status is null or (current_status='ACCEPTED' and (select count(*) from sontu_private.organization_successor_nominations n where n.organization_id=organization.id and n.status='ACCEPTED')<=1)
      then return sontu_private.fail('FINAL_SUCCESSOR_REQUIRED'); end if;
    update sontu_private.organization_successor_nominations n set status='REVOKED',updated_at=now()
      where n.id=(input->>'nomination_id')::uuid and n.organization_id=organization.id;
    result:=jsonb_build_object('status','ready');
  elsif action='retire' then
    if input->>'confirmation'<>organization.display_name then return sontu_private.fail('INVALID_CONFIRMATION'); end if;
    if exists(select 1 from sontu_private.event_owner_contexts c join sontu_private.event_instances e on e.id=c.event_instance_id
      where c.organization_id=organization.id and e.lifecycle in ('DRAFT','PUBLISHED')) then return sontu_private.fail('ORGANIZATION_HAS_ACTIVE_EVENTS'); end if;
    update sontu_private.organizations set lifecycle='RETIRED',retired_at=now(),updated_at=now() where id=organization.id;
    result:=jsonb_build_object('status','ready');
  else return sontu_private.fail('INVALID_INPUT');
  end if;
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'organization_'||action,organization.id,fingerprint,result);
  return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
  return sontu_private.fail('INVALID_INPUT');
end
$$;

create function public.sontu_organization_governance(action text,organization_id uuid default null,input jsonb default '{}'::jsonb,operation_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.organization_governance(action,organization_id,input,operation_id) $$;
revoke all on function sontu_private.organization_governance(text,uuid,jsonb,uuid),public.sontu_organization_governance(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function sontu_private.organization_governance(text,uuid,jsonb,uuid),public.sontu_organization_governance(text,uuid,jsonb,uuid) to authenticated;

create or replace function sontu_private.event_owner(
  event_id uuid,
  owner_kind text default null,
  organization_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor uuid:=auth.uid(); context sontu_private.event_owner_contexts; organization_name text;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if not exists(select 1 from sontu_private.event_instances e where e.id=event_owner.event_id and e.host_owner_user_id=actor) then return sontu_private.fail('UNAUTHORIZED'); end if;
  if owner_kind is not null then
    if not exists(select 1 from sontu_private.event_instances e where e.id=event_owner.event_id and e.lifecycle='DRAFT') then return sontu_private.fail('OWNER_CHANGE_BLOCKED'); end if;
    if owner_kind='PERSONAL' then
      update sontu_private.event_owner_contexts set owner_kind='PERSONAL',personal_user_id=actor,organization_id=null where event_instance_id=event_owner.event_id;
    elsif owner_kind='ORGANIZATION' and exists(
      select 1 from sontu_private.organization_memberships m join sontu_private.organizations o on o.id=m.organization_id
      where m.organization_id=event_owner.organization_id and m.user_id=actor and m.status='ACTIVE' and m.role in ('OWNER','ADMIN')
        and o.lifecycle in ('ACTIVE','CONTINUITY_ACTION_REQUIRED')
    ) then
      update sontu_private.event_owner_contexts set owner_kind='ORGANIZATION',personal_user_id=null,organization_id=event_owner.organization_id where event_instance_id=event_owner.event_id;
    else return sontu_private.fail('ORGANIZATION_NOT_ACTIVE'); end if;
  end if;
  select * into context from sontu_private.event_owner_contexts where event_instance_id=event_owner.event_id;
  if context.owner_kind='ORGANIZATION' then select display_name into organization_name from sontu_private.organizations where id=context.organization_id; end if;
  return jsonb_build_object('status','ready','owner_kind',context.owner_kind,'organization_id',context.organization_id,
    'owner_name',case when context.owner_kind='PERSONAL' then 'Personal' else organization_name end);
end
$$;
