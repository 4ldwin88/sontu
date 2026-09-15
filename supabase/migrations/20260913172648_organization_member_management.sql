create or replace function sontu_private.organization_context(
  action text,
  input jsonb default '{}'::jsonb,
  organization_id uuid default null,
  operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_role text;
  target_role text;
  existing_role text;
  target_user uuid;
  prior sontu_private.operations;
  fingerprint text;
  organization sontu_private.organizations;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='list' then
    return jsonb_build_object('status','ready','organizations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'display_name',o.display_name,'role',m.role,
        'member_count',(select count(*) from sontu_private.organization_memberships x where x.organization_id=o.id and x.status='ACTIVE')
      ) order by o.display_name)
      from sontu_private.organization_memberships m
      join sontu_private.organizations o on o.id=m.organization_id
      where m.user_id=actor and m.status='ACTIVE'
    ),'[]'::jsonb));
  end if;
  if action='create' then
    if operation_id is null or length(trim(coalesce(input->>'display_name',''))) not between 1 and 160 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
  else
    select role into actor_role from sontu_private.organization_memberships
      where organization_memberships.organization_id=organization_context.organization_id
        and user_id=actor and status='ACTIVE';
    if actor_role is null then return sontu_private.fail('UNAUTHORIZED'); end if;
    if action='detail' then
      select * into organization from sontu_private.organizations o where o.id=organization_context.organization_id;
      return jsonb_build_object('status','ready','organization',jsonb_build_object(
        'id',organization.id,'display_name',organization.display_name,'role',actor_role,
        'can_manage',actor_role in ('OWNER','ADMIN')),
        'members',coalesce((select jsonb_agg(jsonb_build_object(
          'user_id',m.user_id,'email',u.email,
          'display_name',coalesce(nullif(p.display_name,''),p.first_name,split_part(u.email,'@',1)),
          'role',m.role,'status',m.status
        ) order by case m.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end,
          coalesce(nullif(p.display_name,''),p.first_name,u.email))
          from sontu_private.organization_memberships m
          join auth.users u on u.id=m.user_id
          left join sontu_private.account_profiles p on p.user_id=m.user_id
          where m.organization_id=organization_context.organization_id and m.status='ACTIVE'
        ),'[]'::jsonb));
    end if;
    if actor_role not in ('OWNER','ADMIN') or operation_id is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'action',action,'input',input,'organization_id',organization_context.organization_id
  )::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;

  if action='create' then
    insert into sontu_private.organizations(display_name,created_by)
    values(trim(input->>'display_name'),actor) returning * into organization;
    insert into sontu_private.organization_memberships(organization_id,user_id,role)
    values(organization.id,actor,'OWNER');
    result:=jsonb_build_object('status','ready','organization',jsonb_build_object(
      'id',organization.id,'display_name',organization.display_name,'role','OWNER','member_count',1));
  elsif action='add_member' then
    target_role:=coalesce(input->>'role','MEMBER');
    if target_role not in ('ADMIN','MEMBER') or (target_role='ADMIN' and actor_role<>'OWNER') then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    select id into target_user from auth.users where lower(email)=lower(trim(input->>'email'));
    if target_user is null then return sontu_private.fail('ACCOUNT_NOT_FOUND'); end if;
    select role into existing_role from sontu_private.organization_memberships
      where organization_memberships.organization_id=organization_context.organization_id
        and user_id=target_user and status='ACTIVE';
    if target_user=actor or existing_role='OWNER' or (actor_role<>'OWNER' and existing_role='ADMIN') then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    insert into sontu_private.organization_memberships(organization_id,user_id,role,status)
    values(organization_context.organization_id,target_user,target_role,'ACTIVE')
    on conflict on constraint organization_memberships_pkey
    do update set role=excluded.role,status='ACTIVE',updated_at=now();
    result:=jsonb_build_object('status','ready','user_id',target_user);
  elsif action='update_member' then
    target_user:=(input->>'user_id')::uuid;
    target_role:=input->>'role';
    select role into target_role from sontu_private.organization_memberships
      where organization_memberships.organization_id=organization_context.organization_id and user_id=target_user and status='ACTIVE';
    if target_role='OWNER' or target_user=actor or input->>'role' not in ('ADMIN','MEMBER')
      or (actor_role<>'OWNER' and (target_role='ADMIN' or input->>'role'='ADMIN')) then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    update sontu_private.organization_memberships set role=input->>'role',updated_at=now()
      where organization_memberships.organization_id=organization_context.organization_id and user_id=target_user and status='ACTIVE';
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','user_id',target_user);
  elsif action='remove_member' then
    target_user:=(input->>'user_id')::uuid;
    select role into target_role from sontu_private.organization_memberships
      where organization_memberships.organization_id=organization_context.organization_id and user_id=target_user and status='ACTIVE';
    if target_role='OWNER' or target_user=actor or (actor_role<>'OWNER' and target_role='ADMIN') then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    update sontu_private.organization_memberships set status='REVOKED',updated_at=now()
      where organization_memberships.organization_id=organization_context.organization_id and user_id=target_user and status='ACTIVE';
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','user_id',target_user);
  else
    return sontu_private.fail('INVALID_INPUT');
  end if;
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'organization_'||action,coalesce(organization_context.organization_id,organization.id),fingerprint,result);
  return result;
exception when invalid_text_representation or check_violation or not_null_violation then
  return sontu_private.fail('INVALID_INPUT');
end
$$;

revoke all on function sontu_private.organization_context(text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function sontu_private.organization_context(text,jsonb,uuid,uuid) to authenticated;
