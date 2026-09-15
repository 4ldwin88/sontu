-- UX authority 30.23–30.25. IDs are immutable; handles are never authorization keys.
create table sontu_private.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null check(char_length(first_name) between 1 and 80),
 display_name text not null default '' check(char_length(display_name)<=80),
 handle text not null unique check(handle ~ '^[a-z0-9][a-z0-9_.]{2,29}$'),
 handle_provisional boolean not null default true,
 handle_changed_at timestamptz,
 revision integer not null default 1,
 created_at timestamptz not null default now()
);
alter table sontu_private.account_profiles enable row level security;
create table sontu_private.reserved_handles(handle text primary key);
alter table sontu_private.reserved_handles enable row level security;
insert into sontu_private.reserved_handles values ('sontu'),('admin'),('administrator'),('support'),('help'),('security'),('official'),('moderator'),('staff'),('system'),('root'),('api'),('privacy'),('legal'),('notifications');
revoke all on sontu_private.account_profiles,sontu_private.reserved_handles from anon,authenticated;

create function sontu_private.account_profile(action text, input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); p sontu_private.account_profiles; n text; h text; d text; stem text; attempt integer;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('status','denied'); end if;
 perform pg_advisory_xact_lock(hashtextextended('profile:'||uid::text,0));
 select * into p from sontu_private.account_profiles where user_id=uid for update;
 if action='read' then
  if p.user_id is null then return jsonb_build_object('status','empty'); end if;
 elsif action='create' then
  if p.user_id is null then
   n:=btrim(input->>'first_name');
   if n is null or char_length(n) not between 1 and 80 then return jsonb_build_object('status','error','error_code','INVALID_NAME'); end if;
   stem:=left(regexp_replace(lower(n),'[^a-z0-9]','','g'),20);
   if stem='' then stem:='member'; end if;
   for attempt in 1..10 loop
    h:=stem||'_'||left(replace(gen_random_uuid()::text,'-',''),8);
    begin
     insert into sontu_private.account_profiles(user_id,first_name,handle) values(uid,n,h) returning * into p;
     exit;
    exception when unique_violation then
     if attempt=10 then raise; end if;
    end;
   end loop;
  end if;
 elsif action='update' then
  if p.user_id is null then return jsonb_build_object('status','empty'); end if;
  if (input->>'revision')::integer is distinct from p.revision then return jsonb_build_object('status','error','error_code','STALE_PROFILE'); end if;
  n:=btrim(input->>'first_name'); d:=btrim(coalesce(input->>'display_name','')); h:=lower(btrim(input->>'handle'));
  if n is null or char_length(n) not between 1 and 80 or char_length(d)>80 then return jsonb_build_object('status','error','error_code','INVALID_NAME'); end if;
  if h is null or h !~ '^[a-z0-9][a-z0-9_.]{2,29}$' or exists(select 1 from sontu_private.reserved_handles r where r.handle=h) then return jsonb_build_object('status','error','error_code','INVALID_HANDLE'); end if;
  if h<>p.handle and not p.handle_provisional and p.handle_changed_at>now()-interval '30 days' then return jsonb_build_object('status','error','error_code','HANDLE_COOLDOWN'); end if;
  begin
   update sontu_private.account_profiles set first_name=n,display_name=d,handle=h,
    handle_provisional=case when h<>p.handle then false else p.handle_provisional end,
    handle_changed_at=case when h<>p.handle then now() else p.handle_changed_at end,
    revision=revision+1 where user_id=uid returning * into p;
  exception when unique_violation then return jsonb_build_object('status','error','error_code','HANDLE_UNAVAILABLE'); end;
 else return jsonb_build_object('status','error','error_code','INVALID_ACTION'); end if;
 return jsonb_build_object('status','ready','profile',to_jsonb(p));
end $$;
revoke all on function sontu_private.account_profile(text,jsonb) from public;
grant execute on function sontu_private.account_profile(text,jsonb) to authenticated;
create function public.sontu_account_profile(action text default 'read', input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.account_profile(action,input) $$;
revoke all on function public.sontu_account_profile(text,jsonb) from public;
grant execute on function public.sontu_account_profile(text,jsonb) to authenticated;
