create function sontu_private.guard_organization_membership()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare actor_role text;
begin
  if old.role='OWNER' and (new.role<>'OWNER' or new.status<>'ACTIVE') then
    raise check_violation using message='organization owner is immutable';
  end if;
  if new.user_id=auth.uid() and (new.role<>old.role or new.status<>old.status) then
    raise check_violation using message='self role changes are not allowed';
  end if;
  select role into actor_role from sontu_private.organization_memberships
    where organization_id=old.organization_id and user_id=auth.uid() and status='ACTIVE';
  if actor_role='ADMIN' and old.role in ('OWNER','ADMIN')
    and (new.role<>old.role or new.status<>old.status) then
    raise check_violation using message='admin cannot change privileged membership';
  end if;
  return new;
end
$$;

create trigger guard_organization_membership
before update on sontu_private.organization_memberships
for each row execute function sontu_private.guard_organization_membership();

revoke all on function sontu_private.guard_organization_membership() from public,anon,authenticated;
