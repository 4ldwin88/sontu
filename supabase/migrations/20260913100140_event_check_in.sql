-- Bounded, event-scoped admission evidence. One current admission per participant;
-- every attempt remains attributable in audit history.
create table sontu_private.event_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  participant_id uuid not null references sontu_private.event_participants(id) on delete cascade,
  checked_in_by uuid not null references auth.users(id),
  checked_in_at timestamptz not null default now(),
  unique(event_instance_id,participant_id)
);
create index event_check_ins_event_time_idx on sontu_private.event_check_ins(event_instance_id,checked_in_at desc);
create index event_check_ins_actor_idx on sontu_private.event_check_ins(checked_in_by);
alter table sontu_private.event_check_ins enable row level security;
revoke all on sontu_private.event_check_ins from anon,authenticated;

create function sontu_private.can_check_in(event_id uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=actor)
 or exists(select 1 from sontu_private.event_team_members m where m.event_instance_id=event_id and m.user_id=actor and m.role in ('CO_HOST','EVENT_MANAGER','CHECK_IN_STAFF'))
$$;

create function sontu_private.check_in_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not sontu_private.can_check_in(event_id,auth.uid()) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready',
  'event',(select jsonb_build_object('id',e.id,'lifecycle',e.lifecycle,'title',v.title,'starts_at',v.starts_at,'timezone',v.timezone)
    from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number where e.id=event_id),
  'counts',jsonb_build_object(
    'eligible',(select count(*) from sontu_private.event_participants p where p.event_instance_id=event_id and p.commitment_state='CONFIRMED'),
    'admitted',(select count(*) from sontu_private.event_check_ins c where c.event_instance_id=event_id)),
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'commitment_state',p.commitment_state,'checked_in_at',c.checked_in_at) order by (c.checked_in_at is null) desc,p.display_name)
    from sontu_private.event_participants p left join sontu_private.event_check_ins c on c.participant_id=p.id and c.event_instance_id=event_id where p.event_instance_id=event_id),'[]'::jsonb));
end $$;

create function sontu_private.check_in_command(event_id uuid,participant_id uuid,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; p sontu_private.event_participants; prior sontu_private.event_operations_requests; fp text; result jsonb;
begin
 if actor is null or not sontu_private.can_check_in(event_id,actor) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED','result','UNABLE_TO_VERIFY'); end if;
 if operation_id is null then return jsonb_build_object('status','error','error_code','INVALID_INPUT','result','UNABLE_TO_VERIFY'); end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 fp:=jsonb_build_object('event_id',event_id,'participant_id',check_in_command.participant_id,'action','CHECK_IN')::text;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=check_in_command.operation_id;
 if found then
  if prior.actor_user_id<>actor or prior.fingerprint<>fp then return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH','result','UNABLE_TO_VERIFY'); end if;
  return prior.result;
 end if;
 select * into e from sontu_private.event_instances where id=event_id;
 select * into p from sontu_private.event_participants ep where ep.id=check_in_command.participant_id;
 if p.id is null then result:=jsonb_build_object('status','error','error_code','INVALID_CREDENTIAL','result','INVALID');
 elsif p.event_instance_id<>event_id then result:=jsonb_build_object('status','error','error_code','WRONG_EVENT','result','WRONG_EVENT');
 elsif e.lifecycle<>'PUBLISHED' or p.commitment_state<>'CONFIRMED' then result:=jsonb_build_object('status','error','error_code','NOT_ELIGIBLE','result','INVALID');
 elsif exists(select 1 from sontu_private.event_check_ins c where c.event_instance_id=event_id and c.participant_id=check_in_command.participant_id) then
  result:=jsonb_build_object('status','ready','result','ALREADY_USED','participant_id',check_in_command.participant_id);
 else
  insert into sontu_private.event_check_ins(event_instance_id,participant_id,checked_in_by) values(event_id,check_in_command.participant_id,actor);
  result:=jsonb_build_object('status','ready','result','ADMITTED','participant_id',check_in_command.participant_id);
 end if;
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,fp,result);
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,actor::text,'CHECK_IN_ATTEMPT',jsonb_build_object('participant_id',check_in_command.participant_id,'result',result->>'result'));
 return result;
end $$;

revoke all on function sontu_private.can_check_in(uuid,uuid),sontu_private.check_in_projection(uuid),sontu_private.check_in_command(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function sontu_private.check_in_projection(uuid),sontu_private.check_in_command(uuid,uuid,uuid) to authenticated;
create function public.sontu_check_in_projection(event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.check_in_projection(event_id) $$;
create function public.sontu_check_in_command(event_id uuid,participant_id uuid,operation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.check_in_command(event_id,participant_id,operation_id) $$;
revoke all on function public.sontu_check_in_projection(uuid),public.sontu_check_in_command(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sontu_check_in_projection(uuid),public.sontu_check_in_command(uuid,uuid,uuid) to authenticated;
