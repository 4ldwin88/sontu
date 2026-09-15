-- Event-scoped collaborators. Attendance, public presentation and operational
-- authority are intentionally independent.
create table sontu_private.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('CO_HOST','EVENT_MANAGER','CHECK_IN_STAFF','VOLUNTEER','PHOTOGRAPHER')),
  attends_event boolean not null default true,
  public_visibility text not null default 'EVENT_TEAM' check (public_visibility in ('EVENT_TEAM','PUBLIC_ROLE','HIDDEN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_instance_id,user_id)
);
create index event_team_members_user_idx on sontu_private.event_team_members(user_id,event_instance_id);
alter table sontu_private.event_team_members enable row level security;
revoke all on sontu_private.event_team_members from anon,authenticated;

alter table sontu_private.event_todos add column assignee_team_member_id uuid references sontu_private.event_team_members(id) on delete set null;
alter table sontu_private.event_resources add column assignee_team_member_id uuid references sontu_private.event_team_members(id) on delete set null;
create index event_todos_assignee_idx on sontu_private.event_todos(assignee_team_member_id) where assignee_team_member_id is not null;
create index event_resources_assignee_idx on sontu_private.event_resources(assignee_team_member_id) where assignee_team_member_id is not null;

create function sontu_private.team_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner boolean;
begin
  select e.host_owner_user_id=auth.uid() into owner from sontu_private.event_instances e where e.id=event_id;
  if auth.uid() is null or not coalesce(owner,false) then
    return jsonb_build_object('status','denied','error_code','UNAUTHORIZED');
  end if;
  return jsonb_build_object('status','ready','members',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'user_id',m.user_id,'email',u.email,
      'display_name',coalesce(nullif(p.display_name,''),p.first_name,split_part(u.email,'@',1)),
      'role',m.role,'attends_event',m.attends_event,'public_visibility',m.public_visibility
    ) order by coalesce(nullif(p.display_name,''),p.first_name,u.email))
    from sontu_private.event_team_members m join auth.users u on u.id=m.user_id
    left join sontu_private.account_profiles p on p.user_id=m.user_id
    where m.event_instance_id=event_id
  ),'[]'::jsonb));
end $$;

create function sontu_private.team_command(cmd text,event_id uuid,member_id uuid,operation_id uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; result jsonb; fp text; prior sontu_private.event_operations_requests;
begin
  if actor is null or not exists(select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=actor) then
    return jsonb_build_object('status','denied','error_code','UNAUTHORIZED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  fp:=jsonb_build_object('cmd',cmd,'event',event_id,'member',member_id,'input',input)::text;
  select * into prior from sontu_private.event_operations_requests r where r.operation_id=team_command.operation_id;
  if found then
    if prior.actor_user_id<>actor or prior.fingerprint<>fp then return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH'); end if;
    return prior.result;
  end if;
  if cmd='add_member' then
    select u.id into target from auth.users u where lower(u.email)=lower(trim(input->>'email'));
    if target is null then return jsonb_build_object('status','error','error_code','ACCOUNT_NOT_FOUND'); end if;
    if target=actor then return jsonb_build_object('status','error','error_code','OWNER_ALREADY_HOST'); end if;
    insert into sontu_private.event_team_members(event_instance_id,user_id,role,attends_event,public_visibility)
    values(event_id,target,input->>'role',coalesce((input->>'attends_event')::boolean,true),coalesce(input->>'public_visibility','EVENT_TEAM'))
    on conflict(event_instance_id,user_id) do update set role=excluded.role,attends_event=excluded.attends_event,public_visibility=excluded.public_visibility,updated_at=now()
    returning id into member_id;
    result:=jsonb_build_object('status','ready','item_id',member_id);
  elsif cmd='update_member' then
    update sontu_private.event_team_members set role=coalesce(input->>'role',role),
      attends_event=coalesce((input->>'attends_event')::boolean,attends_event),
      public_visibility=coalesce(input->>'public_visibility',public_visibility),updated_at=now()
    where id=member_id and event_instance_id=event_id;
    if not found then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','item_id',member_id);
  elsif cmd='remove_member' then
    delete from sontu_private.event_team_members where id=member_id and event_instance_id=event_id;
    if not found then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','item_id',member_id);
  else return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
  insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result)
  values(operation_id,actor,event_id,fp,result);
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
  values(event_id,operation_id,actor::text,'TEAM_'||upper(cmd),jsonb_build_object('member_id',member_id,'input',input));
  return result;
exception when check_violation or invalid_text_representation or not_null_violation then
  return jsonb_build_object('status','error','error_code','INVALID_INPUT');
end $$;

create or replace function sontu_private.event_operations_projection(event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from sontu_private.event_instances e where e.id=event_id and (e.host_owner_user_id=auth.uid() or exists(select 1 from sontu_private.event_team_members m where m.event_instance_id=e.id and m.user_id=auth.uid() and m.role in ('CO_HOST','EVENT_MANAGER','VOLUNTEER')))) then
    return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready',
    'todos',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'due_at',t.due_at,'state',t.state,'assignee_team_member_id',t.assignee_team_member_id) order by t.state desc,t.due_at nulls last,t.created_at) from sontu_private.event_todos t where t.event_instance_id=event_id),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'quantity',r.quantity,'state',r.state,'note',r.note,'assignee_team_member_id',r.assignee_team_member_id) order by r.state desc,r.created_at) from sontu_private.event_resources r where r.event_instance_id=event_id),'[]'::jsonb));
end $$;

-- Existing command stays owner-authoritative; assignment is added as an explicit bounded command.
create function sontu_private.assign_operation_item(kind text,event_id uuid,item_id uuid,team_member_id uuid,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=auth.uid()) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 if team_member_id is not null and not exists(select 1 from sontu_private.event_team_members m where m.id=team_member_id and m.event_instance_id=event_id) then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
 if kind='todo' then update sontu_private.event_todos set assignee_team_member_id=team_member_id,updated_at=now() where id=item_id and event_instance_id=event_id;
 elsif kind='resource' then update sontu_private.event_resources set assignee_team_member_id=team_member_id,updated_at=now() where id=item_id and event_instance_id=event_id;
 else return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
 if not found then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
 result:=jsonb_build_object('status','ready','item_id',item_id);
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,auth.uid()::text,'OPERATION_ASSIGNED',jsonb_build_object('kind',kind,'item_id',item_id,'team_member_id',team_member_id));
 return result;
end $$;

revoke all on function sontu_private.team_projection(uuid),sontu_private.team_command(text,uuid,uuid,uuid,jsonb),sontu_private.assign_operation_item(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function sontu_private.team_projection(uuid),sontu_private.team_command(text,uuid,uuid,uuid,jsonb),sontu_private.assign_operation_item(text,uuid,uuid,uuid,uuid) to authenticated;
create function public.sontu_team_projection(event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.team_projection(event_id) $$;
create function public.sontu_team_command(cmd text,event_id uuid,member_id uuid,operation_id uuid,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.team_command(cmd,event_id,member_id,operation_id,input) $$;
create function public.sontu_assign_operation_item(kind text,event_id uuid,item_id uuid,team_member_id uuid,operation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.assign_operation_item(kind,event_id,item_id,team_member_id,operation_id) $$;
revoke all on function public.sontu_team_projection(uuid),public.sontu_team_command(text,uuid,uuid,uuid,jsonb),public.sontu_assign_operation_item(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sontu_team_projection(uuid),public.sontu_team_command(text,uuid,uuid,uuid,jsonb),public.sontu_assign_operation_item(text,uuid,uuid,uuid,uuid) to authenticated;
