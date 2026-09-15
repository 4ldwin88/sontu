-- Supabase production provides pg_cron. The local integration database does
-- not, so schedule only where the extension is available; all read/write paths
-- also purge expired content defensively.

create table sontu_private.event_accommodation_requests (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  event_participant_id uuid not null unique references sontu_private.event_participants(id) on delete cascade,
  request_content text check (request_content is null or char_length(btrim(request_content)) between 1 and 1000),
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','WITHDRAWN','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  content_deleted_at timestamptz,
  handled_at timestamptz
);
create index event_accommodation_requests_event_idx on sontu_private.event_accommodation_requests(event_instance_id);

create table sontu_private.event_accommodation_access (
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(event_instance_id,user_id)
);

create function sontu_private.purge_expired_accommodation_content() returns void
language sql security definer set search_path='' as $$
  update sontu_private.event_accommodation_requests r set request_content=null,status='EXPIRED',content_deleted_at=now(),updated_at=now()
  from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  where r.event_instance_id=e.id and r.request_content is not null and v.ends_at+interval '30 days'<=now()
$$;
revoke all on function sontu_private.purge_expired_accommodation_content() from public,anon,authenticated;
do $$
begin
  if exists(select 1 from pg_catalog.pg_available_extensions where name='pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $cron$select cron.schedule('sontu-purge-accommodation-content','17 3 * * *',$job$select sontu_private.purge_expired_accommodation_content()$job$)$cron$;
  end if;
exception when undefined_table or undefined_function or invalid_schema_name or feature_not_supported or insufficient_privilege then
  null;
end $$;

create function sontu_private.participant_accommodation(action text,event_id uuid,token text,content text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p sontu_private.event_participants; e sontu_private.event_instances; v sontu_private.event_versions; r sontu_private.event_accommodation_requests; clean text:=nullif(btrim(content),'');
begin
 if action not in ('READ','SAVE','WITHDRAW') or token is null then return sontu_private.fail('INVALID_INPUT'); end if;
 select * into p from sontu_private.event_participants where event_instance_id=participant_accommodation.event_id and token_hash=sha256(convert_to(token,'UTF8')) and token_revoked_at is null and token_expires_at>now() and commitment_state='CONFIRMED'; if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into e from sontu_private.event_instances where id=p.event_instance_id and lifecycle='PUBLISHED'; select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number; if e.id is null then return sontu_private.fail('INVALID_STATE'); end if;
 perform sontu_private.purge_expired_accommodation_content(); select * into r from sontu_private.event_accommodation_requests where event_participant_id=p.id;
 if action='SAVE' then if v.starts_at<=now() or char_length(clean) not between 1 and 1000 then return sontu_private.fail('INVALID_INPUT'); end if; insert into sontu_private.event_accommodation_requests(event_instance_id,event_participant_id,request_content,status) values(e.id,p.id,clean,'OPEN') on conflict(event_participant_id) do update set request_content=excluded.request_content,status='OPEN',updated_at=now(),withdrawn_at=null,content_deleted_at=null; end if;
 if action='WITHDRAW' then if v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if; update sontu_private.event_accommodation_requests set request_content=null,status='WITHDRAWN',withdrawn_at=now(),content_deleted_at=now(),updated_at=now() where event_participant_id=p.id; end if;
 select * into r from sontu_private.event_accommodation_requests where event_participant_id=p.id;
 return jsonb_build_object('status','ready','request',case when r.id is null then null else jsonb_build_object('content',r.request_content,'status',r.status,'updated_at',r.updated_at) end);
end $$;

create function sontu_private.event_accommodations(action text,event_id uuid,request_id uuid default null,staff_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; allowed boolean; r sontu_private.event_accommodation_requests;
begin
 if action not in ('READ','ACKNOWLEDGE','GRANT_STAFF','REVOKE_STAFF') then return sontu_private.fail('INVALID_INPUT'); end if;
 select * into e from sontu_private.event_instances where id=event_accommodations.event_id and event_kind='SIMPLE'; if not found then return sontu_private.fail('INVALID_INPUT'); end if;
 allowed:=e.host_owner_user_id=actor or exists(select 1 from sontu_private.event_accommodation_access a where a.event_instance_id=e.id and a.user_id=actor);
 if actor is null or not allowed then return sontu_private.fail('UNAUTHORIZED'); end if;
 perform sontu_private.purge_expired_accommodation_content();
 if action in ('GRANT_STAFF','REVOKE_STAFF') then
   if e.host_owner_user_id<>actor then return sontu_private.fail('UNAUTHORIZED'); end if;
   if action='GRANT_STAFF' then if not exists(select 1 from sontu_private.event_team_members m where m.event_instance_id=e.id and m.user_id=staff_user_id) then return sontu_private.fail('INVALID_INPUT'); end if; insert into sontu_private.event_accommodation_access(event_instance_id,user_id,granted_by) values(e.id,staff_user_id,actor) on conflict do nothing; else delete from sontu_private.event_accommodation_access where event_instance_id=e.id and user_id=staff_user_id; end if;
 elsif action='ACKNOWLEDGE' then update sontu_private.event_accommodation_requests set status='ACKNOWLEDGED',handled_at=now(),updated_at=now() where id=request_id and event_instance_id=e.id and request_content is not null; if not found then return sontu_private.fail('INVALID_INPUT'); end if; end if;
 return jsonb_build_object('status','ready','requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'participant_name',p.display_name,'content',r.request_content,'status',r.status,'updated_at',r.updated_at) order by r.updated_at desc) from sontu_private.event_accommodation_requests r join sontu_private.event_participants p on p.id=r.event_participant_id where r.event_instance_id=e.id and r.request_content is not null),'[]'::jsonb));
end $$;

create function public.sontu_participant_accommodation(action text,event_id uuid,token text,content text default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.participant_accommodation(action,event_id,token,content) $$;
create function public.sontu_event_accommodations(action text,event_id uuid,request_id uuid default null,staff_user_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_accommodations(action,event_id,request_id,staff_user_id) $$;
revoke all on function sontu_private.participant_accommodation(text,uuid,text,text),sontu_private.event_accommodations(text,uuid,uuid,uuid),public.sontu_participant_accommodation(text,uuid,text,text),public.sontu_event_accommodations(text,uuid,uuid,uuid) from public;
grant execute on function public.sontu_participant_accommodation(text,uuid,text,text) to anon,authenticated;
grant execute on function public.sontu_event_accommodations(text,uuid,uuid,uuid) to authenticated;
