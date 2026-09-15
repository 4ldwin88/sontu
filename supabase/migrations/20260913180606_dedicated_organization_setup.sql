alter table sontu_private.organizations
  add column organization_type text not null default 'OTHER'
    check(organization_type in ('BUSINESS','NONPROFIT','COMMUNITY','VENUE','EDUCATION','GOVERNMENT','OTHER')),
  add column description text not null default '' check(length(description)<=500),
  add column visibility text not null default 'PRIVATE' check(visibility in ('PUBLIC','PRIVATE'));

create function sontu_private.organization_setup(input jsonb,operation_id uuid)
returns jsonb
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
  if operation_id is null or jsonb_typeof(input)<>'object'
    or length(trim(coalesce(input->>'display_name',''))) not between 1 and 160
    or coalesce(input->>'organization_type','') not in ('BUSINESS','NONPROFIT','COMMUNITY','VENUE','EDUCATION','GOVERNMENT','OTHER')
    or coalesce(input->>'visibility','') not in ('PUBLIC','PRIVATE')
    or length(coalesce(input->>'description',''))>500 then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(input::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;
  insert into sontu_private.organizations(display_name,organization_type,description,visibility,created_by)
  values(trim(input->>'display_name'),input->>'organization_type',trim(coalesce(input->>'description','')),input->>'visibility',actor)
  returning * into organization;
  insert into sontu_private.organization_memberships(organization_id,user_id,role)
  values(organization.id,actor,'OWNER');
  result:=jsonb_build_object('status','ready','organization',jsonb_build_object(
    'id',organization.id,'display_name',organization.display_name,'role','OWNER','member_count',1,
    'organization_type',organization.organization_type,'description',organization.description,'visibility',organization.visibility));
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'organization_setup',organization.id,fingerprint,result);
  return result;
end
$$;

revoke all on function sontu_private.organization_setup(jsonb,uuid) from public,anon,authenticated;
grant execute on function sontu_private.organization_setup(jsonb,uuid) to authenticated;

create function public.sontu_organization_setup(input jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.organization_setup(input,operation_id) $$;
revoke all on function public.sontu_organization_setup(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.sontu_organization_setup(jsonb,uuid) to authenticated;
