-- Organization membership and event-team authority remain separate. Membership
-- is required for organization-owned events, then the event role grants scope.
create function sontu_private.guard_organization_event_team()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare org_id uuid;
begin
  select c.organization_id into org_id
  from sontu_private.event_owner_contexts c
  where c.event_instance_id=new.event_instance_id and c.owner_kind='ORGANIZATION';
  if org_id is not null and not exists(
    select 1 from sontu_private.organization_memberships m
    where m.organization_id=org_id
      and m.user_id=new.user_id and m.status='ACTIVE'
  ) then
    raise check_violation using message='organization event teammate must be an active organization member';
  end if;
  return new;
end
$$;

create trigger guard_organization_event_team
before insert or update on sontu_private.event_team_members
for each row execute function sontu_private.guard_organization_event_team();

create function sontu_private.revoke_removed_organization_member_event_access()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='ACTIVE' and new.status='REVOKED' then
    delete from sontu_private.event_team_members t
    using sontu_private.event_owner_contexts c
    where t.event_instance_id=c.event_instance_id
      and c.owner_kind='ORGANIZATION'
      and c.organization_id=new.organization_id
      and t.user_id=new.user_id;
  end if;
  return new;
end
$$;

create trigger revoke_removed_organization_member_event_access
after update on sontu_private.organization_memberships
for each row execute function sontu_private.revoke_removed_organization_member_event_access();

revoke all on function sontu_private.guard_organization_event_team(),
  sontu_private.revoke_removed_organization_member_event_access()
from public,anon,authenticated;
