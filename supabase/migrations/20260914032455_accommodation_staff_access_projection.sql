create or replace function sontu_private.event_accommodations(action text,event_id uuid,request_id uuid default null,staff_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  e sontu_private.event_instances;
  allowed boolean;
begin
  if action not in ('READ','ACKNOWLEDGE','GRANT_STAFF','REVOKE_STAFF') then
    return sontu_private.fail('INVALID_INPUT');
  end if;
  select * into e from sontu_private.event_instances
  where id=event_accommodations.event_id and event_kind='SIMPLE';
  if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  allowed:=e.host_owner_user_id=actor or exists(
    select 1 from sontu_private.event_accommodation_access a
    where a.event_instance_id=e.id and a.user_id=actor
  );
  if actor is null or not allowed then return sontu_private.fail('UNAUTHORIZED'); end if;
  perform sontu_private.purge_expired_accommodation_content();
  if action in ('GRANT_STAFF','REVOKE_STAFF') then
    if e.host_owner_user_id<>actor or staff_user_id is null then
      return sontu_private.fail('UNAUTHORIZED');
    end if;
    if action='GRANT_STAFF' then
      if not exists(
        select 1 from sontu_private.event_team_members m
        where m.event_instance_id=e.id and m.user_id=staff_user_id
      ) then return sontu_private.fail('INVALID_INPUT'); end if;
      insert into sontu_private.event_accommodation_access(event_instance_id,user_id,granted_by)
      values(e.id,staff_user_id,actor) on conflict do nothing;
    else
      delete from sontu_private.event_accommodation_access
      where event_instance_id=e.id and user_id=staff_user_id;
    end if;
  elsif action='ACKNOWLEDGE' then
    update sontu_private.event_accommodation_requests
    set status='ACKNOWLEDGED',handled_at=now(),updated_at=now()
    where id=request_id and event_instance_id=e.id and request_content is not null;
    if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  end if;
  return jsonb_build_object(
    'status','ready',
    'staff_user_ids',coalesce((
      select jsonb_agg(a.user_id order by a.created_at)
      from sontu_private.event_accommodation_access a where a.event_instance_id=e.id
    ),'[]'::jsonb),
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'participant_name',p.display_name,'content',r.request_content,
        'status',r.status,'updated_at',r.updated_at) order by r.updated_at desc)
      from sontu_private.event_accommodation_requests r
      join sontu_private.event_participants p on p.id=r.event_participant_id
      where r.event_instance_id=e.id and r.request_content is not null
    ),'[]'::jsonb)
  );
end $$;
