alter table sontu_private.organizations
  add column logo_path text;

do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'organization-media',
      'organization-media',
      true,
      5242880,
      array['image/jpeg','image/png','image/gif','image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "Organization media public read" on storage.objects';
    execute 'drop policy if exists "Organization media own folder insert" on storage.objects';
    execute 'drop policy if exists "Organization media own folder update" on storage.objects';
    execute 'drop policy if exists "Organization media own folder delete" on storage.objects';

    execute 'create policy "Organization media public read" on storage.objects for select to anon, authenticated using (bucket_id = ''organization-media'')';
    execute 'create policy "Organization media own folder insert" on storage.objects for insert to authenticated with check (bucket_id = ''organization-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Organization media own folder update" on storage.objects for update to authenticated using (bucket_id = ''organization-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''organization-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Organization media own folder delete" on storage.objects for delete to authenticated using (bucket_id = ''organization-media'' and owner = (select auth.uid()) and (storage.foldername(name))[1] = (select auth.uid())::text)';
  end if;
end
$storage$;

create function sontu_private.organization_logo(
  action text,
  organization_id uuid default null,
  logo_path text default null,
  operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); actor_role text;
  normalized_path text:=nullif(btrim(logo_path),'');
  prior sontu_private.operations; fingerprint text; result jsonb;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='overview' then
    return jsonb_build_object(
      'status','ready',
      'logos',coalesce((
        select jsonb_agg(jsonb_build_object('organization_id',o.id,'logo_path',o.logo_path))
        from sontu_private.organization_memberships m
        join sontu_private.organizations o on o.id=m.organization_id
        where m.user_id=actor and m.status='ACTIVE'
      ),'[]'::jsonb)
    );
  end if;
  if action<>'write' or organization_id is null or operation_id is null then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  select m.role into actor_role
  from sontu_private.organization_memberships m
  join sontu_private.organizations o on o.id=m.organization_id
  where m.organization_id=organization_logo.organization_id
    and m.user_id=actor
    and m.status='ACTIVE'
    and m.role in ('OWNER','ADMIN')
    and o.lifecycle<>'RETIRED';
  if actor_role is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  if normalized_path is not null and (
    split_part(normalized_path,'/',1)<>actor::text
    or split_part(normalized_path,'/',2)<>'organizations'
    or normalized_path !~* '\.(jpe?g|png|gif|webp)$'
    or length(normalized_path)>500
  ) then return sontu_private.fail('INVALID_INPUT'); end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'action',action,'organization_id',organization_id,'logo_path',normalized_path
  )::text,'UTF8')),'hex');
  select * into prior from sontu_private.operations where id=operation_id;
  if found then
    if prior.actor_ref<>actor::text then return sontu_private.fail('UNAUTHORIZED'); end if;
    if prior.request_fingerprint<>fingerprint then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;

  update sontu_private.organizations
  set logo_path=normalized_path,updated_at=now()
  where id=organization_id;
  result:=jsonb_build_object('status','ready','logo_path',normalized_path);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
  values(null,operation_id,actor::text,'ORGANIZATION_LOGO_CHANGED',jsonb_build_object('organization_id',organization_id,'logo_path',normalized_path));
  insert into sontu_private.operations(id,actor_ref,command_type,target_id,request_fingerprint,result)
  values(operation_id,actor::text,'organization_logo',organization_id,fingerprint,result);
  return result;
end
$$;

revoke all on function sontu_private.organization_logo(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function sontu_private.organization_logo(text,uuid,text,uuid) to authenticated;

create function public.sontu_organization_logo(
  action text,
  organization_id uuid default null,
  logo_path text default null,
  operation_id uuid default null
) returns jsonb
language sql
security invoker
set search_path=''
as $$ select sontu_private.organization_logo(action,organization_id,logo_path,operation_id) $$;

revoke all on function public.sontu_organization_logo(text,uuid,text,uuid) from public,anon;
grant execute on function public.sontu_organization_logo(text,uuid,text,uuid) to authenticated;
