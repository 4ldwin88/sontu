-- Explicit, mutual member connections and private owner-managed invitation contexts.
create table sontu_private.member_connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('PENDING','ACCEPTED')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester_user_id <> recipient_user_id),
  unique (requester_user_id, recipient_user_id)
);
create unique index member_connections_pair_unique on sontu_private.member_connections
  (least(requester_user_id, recipient_user_id), greatest(requester_user_id, recipient_user_id));

create table sontu_private.connection_contexts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);
create table sontu_private.connection_context_members (
  context_id uuid not null references sontu_private.connection_contexts(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (context_id, member_user_id)
);
alter table sontu_private.member_connections enable row level security;
alter table sontu_private.connection_contexts enable row level security;
alter table sontu_private.connection_context_members enable row level security;
revoke all on sontu_private.member_connections, sontu_private.connection_contexts, sontu_private.connection_context_members from anon, authenticated;

create function sontu_private.connections(action text, input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target uuid; selected_context_id uuid; n text; row sontu_private.member_connections;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('status','denied'); end if;
 if action='read' then
  return jsonb_build_object('status','ready',
   'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'direction',case when c.requester_user_id=uid then 'OUTGOING' else 'INCOMING' end,'user_id',p.user_id,'display_name',coalesce(nullif(p.display_name,''),p.first_name),'handle',p.handle) order by coalesce(nullif(p.display_name,''),p.first_name)) from sontu_private.member_connections c join sontu_private.account_profiles p on p.user_id=case when c.requester_user_id=uid then c.recipient_user_id else c.requester_user_id end where uid in(c.requester_user_id,c.recipient_user_id)),'[]'::jsonb),
   'contexts',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',coalesce(nullif(p.display_name,''),p.first_name),'handle',p.handle) order by coalesce(nullif(p.display_name,''),p.first_name)) from sontu_private.connection_context_members m join sontu_private.account_profiles p on p.user_id=m.member_user_id where m.context_id=x.id),'[]'::jsonb)) order by x.name) from sontu_private.connection_contexts x where x.owner_user_id=uid),'[]'::jsonb));
 elsif action='request' then
  select p.user_id into target from sontu_private.account_profiles p where p.handle=lower(btrim(input->>'handle'));
  if target is null then return jsonb_build_object('status','error','error_code','MEMBER_NOT_FOUND'); end if;
  if target=uid then return jsonb_build_object('status','error','error_code','SELF_CONNECTION'); end if;
  insert into sontu_private.member_connections(requester_user_id,recipient_user_id,status) values(uid,target,'PENDING') on conflict do nothing;
  return jsonb_build_object('status','ready');
 elsif action='accept' then
  update sontu_private.member_connections set status='ACCEPTED',accepted_at=now() where id=(input->>'connection_id')::uuid and recipient_user_id=uid and status='PENDING';
  return jsonb_build_object('status','ready');
 elsif action='remove' then
  delete from sontu_private.member_connections where id=(input->>'connection_id')::uuid and uid in(requester_user_id,recipient_user_id); return jsonb_build_object('status','ready');
 elsif action='create_context' then
  n:=btrim(input->>'name'); if n is null or char_length(n) not between 1 and 80 then return jsonb_build_object('status','error','error_code','INVALID_CONTEXT'); end if;
  insert into sontu_private.connection_contexts(owner_user_id,name) values(uid,n) returning id into selected_context_id; return jsonb_build_object('status','ready','context_id',selected_context_id);
 elsif action in ('add_member','remove_member') then
  selected_context_id:=(input->>'context_id')::uuid; target:=(input->>'user_id')::uuid;
  if not exists(select 1 from sontu_private.connection_contexts x where x.id=selected_context_id and x.owner_user_id=uid) then return jsonb_build_object('status','denied'); end if;
  if action='add_member' then
   if not exists(select 1 from sontu_private.member_connections c where c.status='ACCEPTED' and uid in(c.requester_user_id,c.recipient_user_id) and target in(c.requester_user_id,c.recipient_user_id)) then return jsonb_build_object('status','error','error_code','NOT_CONNECTED'); end if;
   insert into sontu_private.connection_context_members(context_id,member_user_id) values(selected_context_id,target) on conflict do nothing;
  else delete from sontu_private.connection_context_members m where m.context_id=selected_context_id and m.member_user_id=target; end if;
  return jsonb_build_object('status','ready');
 end if;
 return jsonb_build_object('status','error','error_code','INVALID_ACTION');
end $$;
revoke all on function sontu_private.connections(text,jsonb) from public;
grant execute on function sontu_private.connections(text,jsonb) to authenticated;
create function public.sontu_connections(action text default 'read', input jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.connections(action,input) $$;
revoke all on function public.sontu_connections(text,jsonb) from public;
grant execute on function public.sontu_connections(text,jsonb) to authenticated;
