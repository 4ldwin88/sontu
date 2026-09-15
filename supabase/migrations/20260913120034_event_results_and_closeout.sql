-- Closure freezes a small operational outcome snapshot. It does not infer that
-- an unchecked-in participant was a no-show; that remainder stays unknown.
create table sontu_private.event_closeouts (
 id uuid primary key default gen_random_uuid(),
 event_instance_id uuid not null unique references sontu_private.event_instances(id) on delete cascade,
 closed_by uuid not null references auth.users(id),
 confirmed_count integer not null check(confirmed_count>=0),
 admitted_count integer not null check(admitted_count>=0),
 attendance_unknown_count integer not null check(attendance_unknown_count>=0),
 declined_or_withdrawn_count integer not null check(declined_or_withdrawn_count>=0),
 closed_at timestamptz not null default now()
);
create index event_closeouts_closed_by_idx on sontu_private.event_closeouts(closed_by);
alter table sontu_private.event_closeouts enable row level security;
revoke all on sontu_private.event_closeouts from anon,authenticated;

create function sontu_private.results_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner boolean;
begin
 select e.host_owner_user_id=auth.uid() into owner from sontu_private.event_instances e where e.id=event_id;
 if auth.uid() is null or not coalesce(owner,false) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready',
  'lifecycle',(select e.lifecycle from sontu_private.event_instances e where e.id=event_id),
  'summary',jsonb_build_object(
   'confirmed',(select count(*) from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='CONFIRMED'),
   'admitted',(select count(*) from sontu_private.event_check_ins c where c.event_instance_id=event_id),
   'attendance_unknown',(select count(*) from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='CONFIRMED' and not exists(select 1 from sontu_private.event_check_ins c where c.participant_id=p.id and c.event_instance_id=event_id)),
   'declined_or_withdrawn',(select count(*) from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='RELEASED_DECLINED'),
   'open_todos',(select count(*) from sontu_private.event_todos t where t.event_instance_id=event_id and t.state='OPEN'),
   'needed_resources',(select count(*) from sontu_private.event_resources r where r.event_instance_id=event_id and r.state='NEEDED'),
   'unresolved_obligations',(select count(*) from sontu_private.consequence_cases c where c.event_instance_id=event_id and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL'))),
  'closeout',(select jsonb_build_object('closed_at',c.closed_at,'closed_by',c.closed_by,'confirmed',c.confirmed_count,'admitted',c.admitted_count,'attendance_unknown',c.attendance_unknown_count,'declined_or_withdrawn',c.declined_or_withdrawn_count) from sontu_private.event_closeouts c where c.event_instance_id=event_id));
end $$;

create function sontu_private.close_event(event_id uuid,operation_id uuid,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; prior sontu_private.event_operations_requests; fp text; result jsonb; confirmed_n integer; admitted_n integer; declined_n integer;
begin
 if actor is null then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 if operation_id is null or confirmed is distinct from true then return jsonb_build_object('status','error','error_code','INVALID_CONFIRMATION'); end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 fp:=jsonb_build_object('event_id',event_id,'action','CLOSE_EVENT','confirmed',confirmed)::text;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=close_event.operation_id;
 if found then
  if prior.actor_user_id<>actor or prior.fingerprint<>fp then return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH'); end if;
  return prior.result;
 end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=actor for update;
 if not found then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 if e.lifecycle='CLOSED' and exists(select 1 from sontu_private.event_closeouts c where c.event_instance_id=event_id) then
  return jsonb_build_object('status','ready','event_id',event_id,'lifecycle','CLOSED');
 end if;
 if e.lifecycle<>'PUBLISHED' then return jsonb_build_object('status','error','error_code','INVALID_STATE'); end if;
 if exists(select 1 from sontu_private.consequence_cases c where c.event_instance_id=event_id and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL')) then return jsonb_build_object('status','error','error_code','UNRESOLVED_OBLIGATIONS'); end if;
 if exists(select 1 from sontu_private.event_todos t where t.event_instance_id=event_id and t.state='OPEN') then return jsonb_build_object('status','error','error_code','OPEN_TODOS'); end if;
 if exists(select 1 from sontu_private.event_resources r where r.event_instance_id=event_id and r.state='NEEDED') then return jsonb_build_object('status','error','error_code','NEEDED_RESOURCES'); end if;
 select count(*) into confirmed_n from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='CONFIRMED';
 select count(*) into admitted_n from sontu_private.event_check_ins c where c.event_instance_id=event_id;
 select count(*) into declined_n from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='RELEASED_DECLINED';
 insert into sontu_private.event_closeouts(event_instance_id,closed_by,confirmed_count,admitted_count,attendance_unknown_count,declined_or_withdrawn_count)
 values(event_id,actor,confirmed_n,admitted_n,greatest(confirmed_n-admitted_n,0),declined_n);
 update sontu_private.event_instances set lifecycle='CLOSED',updated_at=now() where id=event_id;
 result:=jsonb_build_object('status','ready','event_id',event_id,'lifecycle','CLOSED');
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,fp,result);
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,actor::text,'EVENT_CLOSED',jsonb_build_object('confirmed',confirmed_n,'admitted',admitted_n,'attendance_unknown',greatest(confirmed_n-admitted_n,0),'declined_or_withdrawn',declined_n));
 return result;
end $$;

revoke all on function sontu_private.results_projection(uuid),sontu_private.close_event(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function sontu_private.results_projection(uuid),sontu_private.close_event(uuid,uuid,boolean) to authenticated;
create function public.sontu_results_projection(event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.results_projection(event_id) $$;
create function public.sontu_close_event(event_id uuid,operation_id uuid,confirmed boolean) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.close_event(event_id,operation_id,confirmed) $$;
revoke all on function public.sontu_results_projection(uuid),public.sontu_close_event(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.sontu_results_projection(uuid),public.sontu_close_event(uuid,uuid,boolean) to authenticated;
