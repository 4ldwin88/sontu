create function sontu_private.organization_context(
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
  prior sontu_private.operations;
  fingerprint text;
  organization sontu_private.organizations;
  result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='list' then
    return jsonb_build_object('status','ready','organizations',coalesce((
      select jsonb_agg(jsonb_build_object('id',o.id,'display_name',o.display_name,'role',m.role) order by o.display_name)
      from sontu_private.organization_memberships m
      join sontu_private.organizations o on o.id=m.organization_id
      where m.user_id=actor and m.status='ACTIVE'
    ),'[]'::jsonb));
  end if;
  if action<>'create' or operation_id is null
    or length(trim(coalesce(input->>'display_name',''))) not between 1 and 160 then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',action,'input',input)::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;
  insert into sontu_private.organizations(display_name,created_by)
  values(trim(input->>'display_name'),actor) returning * into organization;
  insert into sontu_private.organization_memberships(organization_id,user_id,role)
  values(organization.id,actor,'OWNER');
  result:=jsonb_build_object('status','ready','organization',jsonb_build_object(
    'id',organization.id,'display_name',organization.display_name,'role','OWNER'));
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'create_organization',organization.id,fingerprint,result);
  return result;
end
$$;

create function sontu_private.event_owner(
  event_id uuid,
  owner_kind text default null,
  organization_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  context sontu_private.event_owner_contexts;
  organization_name text;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if not exists(select 1 from sontu_private.event_instances e where e.id=event_owner.event_id and e.host_owner_user_id=actor) then
    return sontu_private.fail('UNAUTHORIZED');
  end if;
  if owner_kind is not null then
    if not exists(select 1 from sontu_private.event_instances e where e.id=event_owner.event_id and e.lifecycle='DRAFT') then
      return sontu_private.fail('OWNER_CHANGE_BLOCKED');
    end if;
    if owner_kind='PERSONAL' then
      update sontu_private.event_owner_contexts
      set owner_kind='PERSONAL',personal_user_id=actor,organization_id=null
      where event_instance_id=event_owner.event_id;
    elsif owner_kind='ORGANIZATION' and exists(
      select 1 from sontu_private.organization_memberships m
      where m.organization_id=event_owner.organization_id and m.user_id=actor
        and m.status='ACTIVE' and m.role in ('OWNER','ADMIN')
    ) then
      update sontu_private.event_owner_contexts
      set owner_kind='ORGANIZATION',personal_user_id=null,organization_id=event_owner.organization_id
      where event_instance_id=event_owner.event_id;
    else
      return sontu_private.fail('UNAUTHORIZED');
    end if;
  end if;
  select * into context from sontu_private.event_owner_contexts where event_instance_id=event_owner.event_id;
  if context.owner_kind='ORGANIZATION' then
    select display_name into organization_name from sontu_private.organizations where id=context.organization_id;
  end if;
  return jsonb_build_object('status','ready','owner_kind',context.owner_kind,
    'organization_id',context.organization_id,
    'owner_name',case when context.owner_kind='PERSONAL' then 'Personal' else organization_name end);
end
$$;

create function public.sontu_organization_context(action text,input jsonb default '{}'::jsonb,organization_id uuid default null,operation_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.organization_context(action,input,organization_id,operation_id) $$;
create function public.sontu_event_owner(event_id uuid,owner_kind text default null,organization_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.event_owner(event_id,owner_kind,organization_id) $$;

revoke all on function sontu_private.organization_context(text,jsonb,uuid,uuid),sontu_private.event_owner(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.sontu_organization_context(text,jsonb,uuid,uuid),public.sontu_event_owner(uuid,text,uuid) from public,anon,authenticated;
grant execute on function sontu_private.organization_context(text,jsonb,uuid,uuid),sontu_private.event_owner(uuid,text,uuid) to authenticated;
grant execute on function public.sontu_organization_context(text,jsonb,uuid,uuid),public.sontu_event_owner(uuid,text,uuid) to authenticated;
