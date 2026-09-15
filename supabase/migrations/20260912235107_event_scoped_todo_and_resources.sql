-- Bounded event-scoped coordination. These records are deliberately attached to
-- one event and cannot become account-wide project-management objects.
create table sontu_private.event_todos (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  due_at timestamptz,
  state text not null default 'OPEN' check (state in ('OPEN','DONE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_todos_event_idx on sontu_private.event_todos(event_instance_id, state, due_at);
alter table sontu_private.event_todos enable row level security;

create table sontu_private.event_resources (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  state text not null default 'NEEDED' check (state in ('NEEDED','READY')),
  note text check (note is null or char_length(note) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_resources_event_idx on sontu_private.event_resources(event_instance_id, state);
alter table sontu_private.event_resources enable row level security;

create table sontu_private.event_operations_requests (
  operation_id uuid primary key,
  actor_user_id uuid not null references auth.users(id),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table sontu_private.event_operations_requests enable row level security;

create function sontu_private.event_operations_projection(event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('status','denied','error_code','UNAUTHORIZED');
  end if;
  if not exists (
    select 1 from sontu_private.event_instances e
    where e.id = event_id and e.host_owner_user_id = auth.uid()
  ) then
    return jsonb_build_object('status','denied','error_code','UNAUTHORIZED');
  end if;
  return jsonb_build_object(
    'status','ready',
    'todos',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'title',t.title,'due_at',t.due_at,'state',t.state
    ) order by t.state desc,t.due_at nulls last,t.created_at)
      from sontu_private.event_todos t where t.event_instance_id=event_id),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'label',r.label,'quantity',r.quantity,'state',r.state,'note',r.note
    ) order by r.state desc,r.created_at)
      from sontu_private.event_resources r where r.event_instance_id=event_id),'[]'::jsonb)
  );
end $$;

create function sontu_private.event_operations_command(
  cmd text, event_id uuid, item_id uuid, operation_id uuid, input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  fp text := concat_ws('|',cmd,event_id,item_id,coalesce(input,'{}'::jsonb)::text);
  prior sontu_private.event_operations_requests;
  result jsonb;
begin
  if actor is null or not exists (
    select 1 from sontu_private.event_instances e
    where e.id=event_id and e.host_owner_user_id=actor
  ) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
  select * into prior from sontu_private.event_operations_requests r where r.operation_id=event_operations_command.operation_id;
  if found then
    if prior.actor_user_id<>actor or prior.fingerprint<>fp then
      return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH');
    end if;
    return prior.result;
  end if;
  if cmd='add_todo' then
    insert into sontu_private.event_todos(event_instance_id,title,due_at)
    values(event_id,trim(input->>'title'),nullif(input->>'due_at','')::timestamptz)
    returning jsonb_build_object('status','ready','item_id',id) into result;
  elsif cmd='set_todo_state' then
    update sontu_private.event_todos set state=input->>'state',updated_at=now()
    where id=item_id and event_instance_id=event_id;
    if not found then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','item_id',item_id);
  elsif cmd='add_resource' then
    insert into sontu_private.event_resources(event_instance_id,label,quantity,note)
    values(event_id,trim(input->>'label'),coalesce((input->>'quantity')::integer,1),nullif(trim(input->>'note'),''))
    returning jsonb_build_object('status','ready','item_id',id) into result;
  elsif cmd='set_resource_state' then
    update sontu_private.event_resources set state=input->>'state',updated_at=now()
    where id=item_id and event_instance_id=event_id;
    if not found then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
    result:=jsonb_build_object('status','ready','item_id',item_id);
  else return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
  insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result)
  values(operation_id,actor,event_id,fp,result);
  return result;
exception when check_violation or invalid_text_representation or not_null_violation then
  return jsonb_build_object('status','error','error_code','INVALID_INPUT');
end $$;

revoke all on function sontu_private.event_operations_projection(uuid),
  sontu_private.event_operations_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function sontu_private.event_operations_projection(uuid),
  sontu_private.event_operations_command(text,uuid,uuid,uuid,jsonb) to authenticated;

create function public.sontu_event_operations_projection(event_id uuid) returns jsonb
language sql security invoker set search_path='' as
$$ select sontu_private.event_operations_projection(event_id) $$;
create function public.sontu_event_operations_command(cmd text,event_id uuid,item_id uuid,operation_id uuid,input jsonb) returns jsonb
language sql security invoker set search_path='' as
$$ select sontu_private.event_operations_command(cmd,event_id,item_id,operation_id,input) $$;
revoke all on function public.sontu_event_operations_projection(uuid),
  public.sontu_event_operations_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sontu_event_operations_projection(uuid),
  public.sontu_event_operations_command(text,uuid,uuid,uuid,jsonb) to authenticated;
