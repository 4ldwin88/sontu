-- Repair the intent wrapper's private-function permission. The private function
-- still performs its own ownership check and is not exposed through PostgREST.
grant execute on function sontu_private.set_event_intent(uuid,text,text) to authenticated;

alter table sontu_private.event_instances
  add column visibility text not null default 'PRIVATE'
  check (visibility in ('PUBLIC','PRIVATE'));

create function sontu_private.event_visibility(action text,event_id uuid,value text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_value text;
begin
  if auth.uid() is null or not exists(
    select 1 from sontu_private.event_instances e
    where e.id=event_visibility.event_id and e.host_owner_user_id=auth.uid() and e.event_kind='SIMPLE'
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='write' then
    if value not in ('PUBLIC','PRIVATE') then return sontu_private.fail('INVALID_INPUT'); end if;
    update sontu_private.event_instances set visibility=value,updated_at=now()
      where id=event_visibility.event_id and lifecycle='DRAFT';
    if not found then return sontu_private.fail('INVALID_STATE'); end if;
  elsif action<>'read' then return sontu_private.fail('INVALID_INPUT'); end if;
  select visibility into current_value from sontu_private.event_instances where id=event_visibility.event_id;
  return jsonb_build_object('status','ready','visibility',current_value);
end $$;
revoke all on function sontu_private.event_visibility(text,uuid,text) from public,anon,authenticated;
grant execute on function sontu_private.event_visibility(text,uuid,text) to authenticated;
create function public.sontu_event_visibility(action text,event_id uuid,value text default null) returns jsonb
language sql security invoker set search_path='' as $$ select sontu_private.event_visibility(action,event_id,value) $$;
revoke all on function public.sontu_event_visibility(text,uuid,text) from public,anon;
grant execute on function public.sontu_event_visibility(text,uuid,text) to authenticated;

create function sontu_private.public_events(event_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status','ready','events',coalesce(jsonb_agg(x order by x.starts_at nulls last,x.id),'[]'::jsonb))
  from (
    select e.id,e.lifecycle,e.event_category as category,e.event_format as format,e.visibility,
      v.title,v.description,v.starts_at,v.ends_at,v.timezone,v.venue_label,v.cover_key,v.capacity,
      false as hosting,null::text as commitment_state,null::text as invitation_state,
      ((select count(*) from sontu_private.event_participants p where p.event_instance_id=e.id and p.commitment_state='CONFIRMED')
       + (select count(*) from sontu_private.event_team_members m where m.event_instance_id=e.id and m.attends_event)
       + 1)::int as going_count,
      (select coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id) as host_name
    from sontu_private.event_instances e
    join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
    where e.event_kind='SIMPLE' and e.visibility='PUBLIC' and e.lifecycle in ('PUBLISHED','CANCELLED','CLOSED')
      and (public_events.event_id is null or e.id=public_events.event_id)
  ) x
$$;
revoke all on function sontu_private.public_events(uuid) from public,anon,authenticated;
grant execute on function sontu_private.public_events(uuid) to anon,authenticated;

create function public.sontu_public_events(event_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select sontu_private.public_events(event_id) $$;
revoke all on function public.sontu_public_events(uuid) from public;
grant execute on function public.sontu_public_events(uuid) to anon,authenticated;
