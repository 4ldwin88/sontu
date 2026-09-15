create or replace function sontu_private.privacy_request(action text default 'read', requested_kind text default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  existing sontu_private.privacy_requests;
  created sontu_private.privacy_requests;
begin
  if actor is null or not exists (
    select 1 from auth.users u where u.id=actor and not coalesce(u.is_anonymous,false)
  ) then
    return jsonb_build_object('status','denied');
  end if;
  if action='read' then
    return jsonb_build_object('status','ready','requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'request_kind',r.request_kind,'status',r.status,
        'requested_at',r.requested_at,'resolved_at',r.resolved_at
      ) order by r.requested_at desc)
      from sontu_private.privacy_requests r where r.user_id=actor
    ),'[]'::jsonb));
  end if;
  if action<>'request' or requested_kind is null or requested_kind not in ('ACCESS_EXPORT', 'CORRECTION', 'DELETE_OR_CLOSE') then
    return jsonb_build_object('status','error','error_code','INVALID_ACTION');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('privacy-request:'||actor::text||':'||requested_kind,0));
  select * into existing from sontu_private.privacy_requests r
    where r.user_id=actor and r.request_kind=requested_kind and r.status in ('RECEIVED','IN_REVIEW')
    order by r.requested_at desc limit 1;
  if existing.id is not null then
    return jsonb_build_object('status','ready','request',jsonb_build_object(
      'id',existing.id,'request_kind',existing.request_kind,'status',existing.status,
      'requested_at',existing.requested_at,'resolved_at',existing.resolved_at
    ),'already_open',true);
  end if;
  insert into sontu_private.privacy_requests(user_id,request_kind)
    values(actor,requested_kind) returning * into created;
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
    values(null,gen_random_uuid(),actor::text,'PRIVACY_REQUEST_RECEIVED',jsonb_build_object('request_kind',requested_kind));
  return jsonb_build_object('status','ready','request',jsonb_build_object(
    'id',created.id,'request_kind',created.request_kind,'status',created.status,
    'requested_at',created.requested_at,'resolved_at',created.resolved_at
  ),'already_open',false);
end $$;
revoke all on function sontu_private.privacy_request(text,text) from public, anon, authenticated;
grant execute on function sontu_private.privacy_request(text,text) to authenticated;
