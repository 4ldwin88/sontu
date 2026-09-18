create or replace function sontu_private.close_event(event_id uuid,operation_id uuid,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; prior sontu_private.event_operations_requests; result jsonb; confirmed_n integer; admitted_n integer; declined_n integer;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if operation_id is null or confirmed is distinct from true then return jsonb_build_object('status','error','error_code','INVALID_CONFIRMATION'); end if;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=close_event.operation_id;
 if found then return prior.result; end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=actor for update;
 if e.id is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if e.lifecycle='COMPLETED' and exists(select 1 from sontu_private.event_closeouts c where c.event_instance_id=event_id) then return jsonb_build_object('status','ready','event_id',event_id,'lifecycle','COMPLETED'); end if;
 if e.lifecycle<>'IN_PROGRESS' then return jsonb_build_object('status','error','error_code','EVENT_NOT_STARTED'); end if;
 if exists(select 1 from sontu_private.consequence_cases c where c.event_instance_id=event_id and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL')) then return jsonb_build_object('status','error','error_code','UNRESOLVED_OBLIGATIONS'); end if;
 if exists(select 1 from sontu_private.event_todos t where t.event_instance_id=event_id and t.state='OPEN') then return jsonb_build_object('status','error','error_code','OPEN_TODOS'); end if;
 if exists(select 1 from sontu_private.event_resources r where r.event_instance_id=event_id and r.state='NEEDED') then return jsonb_build_object('status','error','error_code','NEEDED_RESOURCES'); end if;
 select count(*) into confirmed_n from sontu_private.event_participants where event_instance_id=event_id and commitment_state='CONFIRMED';
 select count(*) into admitted_n from sontu_private.event_check_ins where event_instance_id=event_id;
 select count(*) into declined_n from sontu_private.event_participants where event_instance_id=event_id and commitment_state='RELEASED_DECLINED';
 insert into sontu_private.event_closeouts(event_instance_id,closed_by,confirmed_count,admitted_count,attendance_unknown_count,declined_or_withdrawn_count) values(event_id,actor,confirmed_n,admitted_n,greatest(confirmed_n-admitted_n,0),declined_n);
 update sontu_private.event_instances set lifecycle='COMPLETED',updated_at=now() where id=event_id;
 result:=jsonb_build_object('status','ready','event_id',event_id,'lifecycle','COMPLETED');
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,jsonb_build_object('event_id',event_id,'action','CLOSE_EVENT','confirmed',confirmed)::text,result);
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,actor::text,'EVENT_COMPLETED',jsonb_build_object('confirmed',confirmed_n,'admitted',admitted_n,'attendance_unknown',greatest(confirmed_n-admitted_n,0),'declined_or_withdrawn',declined_n));
 return result;
end $$;
