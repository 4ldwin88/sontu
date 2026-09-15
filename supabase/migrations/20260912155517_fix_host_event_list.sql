create or replace function sontu_private.host_projection(event_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sontu_private.event_instances; v sontu_private.event_versions; cid uuid;
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if event_id is null then
  return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',ev.title,'lifecycle',i.lifecycle,'starts_at',ev.starts_at) order by i.created_at desc) from sontu_private.event_instances i join sontu_private.event_versions ev on ev.event_instance_id=i.id and ev.version_number=i.current_version_number where i.host_owner_user_id=auth.uid()),'[]'));
 end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=auth.uid();
 if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 select id into cid from sontu_private.consequence_cases where event_instance_id=e.id order by created_at desc,id desc limit 1;
 return jsonb_build_object('status','ready','data',jsonb_build_object(
 'event',jsonb_build_object('id',e.id,'lifecycle',e.lifecycle,'current_version_number',e.current_version_number),
 'version',to_jsonb(v)-'created_by',
 'versions',(select jsonb_agg(to_jsonb(x)-'created_by' order by version_number desc) from sontu_private.event_versions x where event_instance_id=e.id),
 'participants',(select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'commitment_state',p.commitment_state,'response',r.state) order by p.display_name) from sontu_private.event_participants p left join sontu_private.participant_reconfirmations r on r.event_participant_id=p.id and r.consequence_case_id=cid where p.event_instance_id=e.id),
 'cases',coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc,id desc) from sontu_private.consequence_cases c where event_instance_id=e.id),'[]'),
 'suggestion',(select jsonb_build_object('id',m.id,'suggestion_state',m.suggestion_state) from sontu_private.material_changes m where event_instance_id=e.id order by created_at desc,id desc limit 1),
 'provider',(select to_jsonb(x) from sontu_private.evidence_records x where event_instance_id=e.id and source_kind='SIMULATED_PROVIDER' order by authoritative_at desc,received_at desc,id desc limit 1),
 'communications',coalesce((select jsonb_agg(x) from (select dispatch_state,count(*)::int as count from sontu_private.communication_records where event_instance_id=e.id group by dispatch_state) x),'[]'),
 'audit',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (select id,audit_kind,metadata,created_at from sontu_private.audit_entries where event_instance_id=e.id order by created_at desc,id desc limit 100) x),'[]')
 ));
end $$;

