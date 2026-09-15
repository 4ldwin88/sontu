create or replace function sontu_private.check_in_command(event_id uuid,participant_id uuid,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; p sontu_private.event_participants; a sontu_private.event_admissions; prior sontu_private.event_operations_requests; fp text; result jsonb;
begin
 if actor is null or not sontu_private.can_check_in(event_id,actor) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED','result','UNABLE_TO_VERIFY'); end if;
 if operation_id is null then return jsonb_build_object('status','error','error_code','INVALID_INPUT','result','UNABLE_TO_VERIFY'); end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); fp:=jsonb_build_object('event_id',event_id,'participant_id',check_in_command.participant_id,'action','CHECK_IN')::text;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=check_in_command.operation_id;
 if found then if prior.actor_user_id<>actor or prior.fingerprint<>fp then return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH','result','UNABLE_TO_VERIFY'); end if; return prior.result; end if;
 select * into e from sontu_private.event_instances where id=event_id; select * into p from sontu_private.event_participants ep where ep.id=check_in_command.participant_id; select * into a from sontu_private.event_admissions x where x.event_participant_id=check_in_command.participant_id and x.event_instance_id=event_id;
 if p.id is null then result:=jsonb_build_object('status','error','error_code','INVALID_CREDENTIAL','result','INVALID');
 elsif p.event_instance_id<>event_id then result:=jsonb_build_object('status','error','error_code','WRONG_EVENT','result','WRONG_EVENT');
 elsif e.lifecycle<>'IN_PROGRESS' or a.id is null or a.status<>'VALID' then result:=jsonb_build_object('status','error','error_code','NOT_ELIGIBLE','result','INVALID');
 elsif exists(select 1 from sontu_private.event_check_ins c where c.event_instance_id=event_id and c.participant_id=check_in_command.participant_id) then result:=jsonb_build_object('status','ready','result','ALREADY_USED','participant_id',check_in_command.participant_id);
 else insert into sontu_private.event_check_ins(event_instance_id,participant_id,checked_in_by) values(event_id,participant_id,actor); update sontu_private.event_admissions set status='USED',updated_at=now() where id=a.id; result:=jsonb_build_object('status','ready','result','ADMITTED','participant_id',participant_id); end if;
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,fp,result); insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,actor::text,'CHECK_IN_ATTEMPT',jsonb_build_object('participant_id',participant_id,'admission_id',a.id,'result',result->>'result')); return result;
end $$;
