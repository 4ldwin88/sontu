-- Commercially neutral ownership foundation. Plans and payments remain deferred.
create table sontu_private.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check(length(trim(display_name)) between 1 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sontu_private.organization_memberships (
  organization_id uuid not null references sontu_private.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('OWNER','ADMIN','MEMBER')),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);
create index organization_memberships_user_active
  on sontu_private.organization_memberships(user_id,organization_id)
  where status='ACTIVE';

create table sontu_private.event_owner_contexts (
  event_instance_id uuid primary key references sontu_private.event_instances(id) on delete cascade,
  owner_kind text not null check(owner_kind in ('PERSONAL','ORGANIZATION')),
  personal_user_id uuid references auth.users(id),
  organization_id uuid references sontu_private.organizations(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (owner_kind='PERSONAL' and personal_user_id is not null and organization_id is null)
    or (owner_kind='ORGANIZATION' and personal_user_id is null and organization_id is not null)
  )
);
create index event_owner_contexts_personal on sontu_private.event_owner_contexts(personal_user_id) where owner_kind='PERSONAL';
create index event_owner_contexts_organization on sontu_private.event_owner_contexts(organization_id) where owner_kind='ORGANIZATION';

alter table sontu_private.organizations enable row level security;
alter table sontu_private.organization_memberships enable row level security;
alter table sontu_private.event_owner_contexts enable row level security;
revoke all on sontu_private.organizations,sontu_private.organization_memberships,sontu_private.event_owner_contexts from public,anon,authenticated;

insert into sontu_private.event_owner_contexts(event_instance_id,owner_kind,personal_user_id,created_by)
select id,'PERSONAL',host_owner_user_id,host_owner_user_id
from sontu_private.event_instances
on conflict(event_instance_id) do nothing;

create function sontu_private.assign_personal_event_owner()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  insert into sontu_private.event_owner_contexts(event_instance_id,owner_kind,personal_user_id,created_by)
  values(new.id,'PERSONAL',new.host_owner_user_id,new.host_owner_user_id);
  return new;
end
$$;

create trigger assign_personal_event_owner
after insert on sontu_private.event_instances
for each row execute function sontu_private.assign_personal_event_owner();

revoke all on function sontu_private.assign_personal_event_owner() from public,anon,authenticated;

-- Capacity validity is domain truth. Future scope-specific entitlements may set
-- commercial limits without changing the event or identity model.
alter table sontu_private.event_versions drop constraint event_versions_capacity_check;
alter table sontu_private.event_versions add constraint event_versions_capacity_check check(capacity>0);

create or replace function sontu_private.valid_draft(input jsonb) returns boolean
language sql stable set search_path='' as $$
 select jsonb_typeof(input)='object'
 and length(coalesce(input->>'title',''))<=120 and length(coalesce(input->>'description',''))<=2000
 and length(coalesce(input->>'venue_label',''))<=300
 and coalesce(input->>'cover_key','') in ('food','music','market','yoga','sailing','sunset','none')
 and exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timezone')
 and (nullif(input->>'capacity','') is null or (
   input->>'capacity' ~ '^[0-9]+$'
   and (input->>'capacity')::numeric between 1 and 2147483647
 ))
 and (nullif(input->>'starts_at','') is null or isfinite((input->>'starts_at')::timestamptz))
 and (nullif(input->>'ends_at','') is null or isfinite((input->>'ends_at')::timestamptz))
 and (nullif(input->>'starts_at','') is null or nullif(input->>'ends_at','') is null or (input->>'starts_at')::timestamptz<(input->>'ends_at')::timestamptz)
$$;
revoke all on function sontu_private.valid_draft(jsonb) from public,anon,authenticated;
