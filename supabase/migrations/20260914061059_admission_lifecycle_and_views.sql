-- Admission is authoritative. A response withdrawal or event cancellation must
-- invalidate access regardless of the path that performed the state change.
create or replace function sontu_private.sync_rsvp_admission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.commitment_state='CONFIRMED' then
    insert into sontu_private.event_admissions(event_instance_id,event_participant_id,source_kind,status)
    values(new.event_instance_id,new.id,'RSVP','VALID')
    on conflict(event_participant_id) do update
      set status=case when sontu_private.event_admissions.status in ('CANCELLED_EVENT_INVALID','REFUNDED_INVALID') then sontu_private.event_admissions.status else 'VALID' end,
          invalidated_at=case when sontu_private.event_admissions.status in ('CANCELLED_EVENT_INVALID','REFUNDED_INVALID') then sontu_private.event_admissions.invalidated_at else null end,
          updated_at=now();
  elsif old.commitment_state='CONFIRMED' and new.commitment_state<>'CONFIRMED' then
    update sontu_private.event_admissions
      set status='REVOKED',invalidated_at=now(),updated_at=now()
      where event_participant_id=new.id and source_kind='RSVP'
        and status not in ('CANCELLED_EVENT_INVALID','REFUNDED_INVALID');
    update sontu_private.event_credentials c set status='REVOKED',replaced_at=now()
      from sontu_private.event_admissions a
      where c.admission_id=a.id and a.event_participant_id=new.id and c.status='ACTIVE';
  end if;
  return new;
end $$;

create or replace function sontu_private.invalidate_event_admissions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.lifecycle='CANCELLED' and old.lifecycle is distinct from 'CANCELLED' then
    update sontu_private.event_admissions
      set status='CANCELLED_EVENT_INVALID',invalidated_at=now(),updated_at=now()
      where event_instance_id=new.id and status<>'CANCELLED_EVENT_INVALID';
    update sontu_private.event_credentials c set status='REVOKED',replaced_at=now()
      from sontu_private.event_admissions a
      where c.admission_id=a.id and a.event_instance_id=new.id and c.status='ACTIVE';
    insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(new.id,gen_random_uuid(),coalesce(auth.uid()::text,'system'),'ADMISSIONS_INVALIDATED_EVENT_CANCELLED',jsonb_build_object('previous_lifecycle',old.lifecycle));
  end if;
  return new;
end $$;
drop trigger if exists invalidate_event_admissions_on_cancellation on sontu_private.event_instances;
create trigger invalidate_event_admissions_on_cancellation after update of lifecycle on sontu_private.event_instances
for each row execute function sontu_private.invalidate_event_admissions();

-- Existing cancelled events are repaired once so the invariant holds immediately.
update sontu_private.event_admissions a set status='CANCELLED_EVENT_INVALID',invalidated_at=coalesce(a.invalidated_at,now()),updated_at=now()
from sontu_private.event_instances e where e.id=a.event_instance_id and e.lifecycle='CANCELLED' and a.status<>'CANCELLED_EVENT_INVALID';

create or replace function sontu_private.check_in_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not sontu_private.can_check_in(event_id,auth.uid()) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready',
  'event',(select jsonb_build_object('id',e.id,'lifecycle',e.lifecycle,'title',v.title,'starts_at',v.starts_at,'timezone',v.timezone) from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number where e.id=event_id),
  'counts',jsonb_build_object('eligible',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=event_id and a.status='VALID'),'admitted',(select count(*) from sontu_private.event_check_ins c where c.event_instance_id=event_id)),
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'commitment_state',p.commitment_state,'admission_status',a.status,'checked_in_at',c.checked_in_at) order by (c.checked_in_at is null) desc,p.display_name) from sontu_private.event_participants p left join sontu_private.event_admissions a on a.event_participant_id=p.id left join sontu_private.event_check_ins c on c.participant_id=p.id and c.event_instance_id=event_id where p.event_instance_id=event_id),'[]'::jsonb));
end $$;

create or replace function sontu_private.check_in_command(event_id uuid,participant_id uuid,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; p sontu_private.event_participants; a sontu_private.event_admissions; prior sontu_private.event_operations_requests; fp text; result jsonb;
begin
 if actor is null or not sontu_private.can_check_in(event_id,actor) then return jsonb_build_object('status','denied','error_code','UNAUTHORIZED','result','UNABLE_TO_VERIFY'); end if;
 if operation_id is null then return jsonb_build_object('status','error','error_code','INVALID_INPUT','result','UNABLE_TO_VERIFY'); end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0)); fp:=jsonb_build_object('event_id',event_id,'participant_id',check_in_command.participant_id,'action','CHECK_IN')::text;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=check_in_command.operation_id;
 if found then if prior.actor_user_id<>actor or prior.fingerprint<>fp then return jsonb_build_object('status','error','error_code','IDEMPOTENCY_MISMATCH','result','UNABLE_TO_VERIFY'); end if; return prior.result; end if;
 select * into e from sontu_private.event_instances where id=check_in_command.event_id; select * into p from sontu_private.event_participants ep where ep.id=check_in_command.participant_id; select * into a from sontu_private.event_admissions x where x.event_participant_id=check_in_command.participant_id and x.event_instance_id=check_in_command.event_id;
 if p.id is null then result:=jsonb_build_object('status','error','error_code','INVALID_CREDENTIAL','result','INVALID');
 elsif p.event_instance_id<>check_in_command.event_id then result:=jsonb_build_object('status','error','error_code','WRONG_EVENT','result','WRONG_EVENT');
 elsif exists(select 1 from sontu_private.event_check_ins c where c.event_instance_id=check_in_command.event_id and c.participant_id=check_in_command.participant_id) then result:=jsonb_build_object('status','ready','result','ALREADY_USED','participant_id',check_in_command.participant_id);
 elsif e.lifecycle<>'IN_PROGRESS' or a.id is null or a.status<>'VALID' then result:=jsonb_build_object('status','error','error_code','NOT_ELIGIBLE','result','INVALID');
 else insert into sontu_private.event_check_ins(event_instance_id,participant_id,checked_in_by) values(check_in_command.event_id,check_in_command.participant_id,actor); update sontu_private.event_admissions set status='USED',updated_at=now() where id=a.id; result:=jsonb_build_object('status','ready','result','ADMITTED','participant_id',check_in_command.participant_id); end if;
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,fp,result); insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(event_id,operation_id,actor::text,'CHECK_IN_ATTEMPT',jsonb_build_object('participant_id',participant_id,'admission_id',a.id,'result',result->>'result')); return result;
end $$;

create or replace function sontu_private.host_projection(event_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sontu_private.event_instances; v sontu_private.event_versions; cid uuid;
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if event_id is null then
  return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',ev.title,'lifecycle',i.lifecycle,'starts_at',ev.starts_at,'timezone',ev.timezone,'cover_key',ev.cover_key,'event_kind',i.event_kind,'updated_at',i.updated_at) order by i.created_at desc) from sontu_private.event_instances i join sontu_private.event_versions ev on ev.event_instance_id=i.id and ev.version_number=i.current_version_number where i.host_owner_user_id=auth.uid()),'[]'));
 end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=auth.uid();
 if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 select id into cid from sontu_private.consequence_cases where event_instance_id=e.id order by created_at desc,id desc limit 1;
 return jsonb_build_object(
   'status','ready','data',jsonb_build_object(
     'event',jsonb_build_object('id',e.id,'lifecycle',e.lifecycle,'current_version_number',e.current_version_number,'event_kind',e.event_kind),
     'version',to_jsonb(v)-'created_by',
     'versions',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by' order by version_number desc),'[]'::jsonb) from sontu_private.event_versions x where x.event_instance_id=e.id),
     'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'commitment_state',p.commitment_state,'invitation_state',p.invitation_state,'invitation_email',p.invitation_email,'link_revoked',p.token_revoked_at is not null,'plus_one_allowance',p.plus_one_allowance,'response',r.state,'admission_status',a.status,'admission_issued_at',a.issued_at,'admission_invalidated_at',a.invalidated_at) order by p.display_name),'[]'::jsonb) from sontu_private.event_participants p left join sontu_private.participant_reconfirmations r on r.event_participant_id=p.id and r.consequence_case_id=cid left join sontu_private.event_admissions a on a.event_participant_id=p.id where p.event_instance_id=e.id),
     'admission_summary',jsonb_build_object('valid',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status='VALID'),'used',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status='USED'),'invalid',(select count(*) from sontu_private.event_admissions a where a.event_instance_id=e.id and a.status in ('REVOKED','CANCELLED_EVENT_INVALID','REFUNDED_INVALID','EXPIRED'))),
     'cases',(select coalesce(jsonb_agg(to_jsonb(c) order by created_at desc,id desc),'[]'::jsonb) from sontu_private.consequence_cases c where event_instance_id=e.id),
     'suggestion',(select jsonb_build_object('id',m.id,'suggestion_state',m.suggestion_state) from sontu_private.material_changes m where event_instance_id=e.id order by created_at desc,id desc limit 1),
     'provider',(select to_jsonb(x) from sontu_private.evidence_records x where x.event_instance_id=e.id and x.source_kind='SIMULATED_PROVIDER' order by authoritative_at desc,received_at desc,id desc limit 1),
     'communications',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select dispatch_state,count(*)::int as count from sontu_private.communication_records where event_instance_id=e.id group by dispatch_state) x),
     'audit',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]'::jsonb) from (select id,audit_kind,metadata,created_at from sontu_private.audit_entries where event_instance_id=e.id order by created_at desc,id desc limit 100) x)));
end $$;

revoke all on function sontu_private.sync_rsvp_admission(),sontu_private.invalidate_event_admissions(),sontu_private.check_in_projection(uuid),sontu_private.check_in_command(uuid,uuid,uuid),sontu_private.host_projection(uuid) from public,anon,authenticated;
grant execute on function sontu_private.check_in_projection(uuid),sontu_private.check_in_command(uuid,uuid,uuid),sontu_private.host_projection(uuid) to authenticated;
