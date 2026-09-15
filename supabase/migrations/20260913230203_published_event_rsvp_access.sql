-- Hosts may change who can make future RSVPs after a public event is published.
-- Existing commitments are intentionally preserved; this is an access policy
-- change, not a withdrawal or participant-state transition.
create or replace function sontu_private.event_participation_access(action text,event_id uuid,value text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  current_value text;
  previous_value text;
  current_lifecycle text;
begin
  if auth.uid() is null or not exists(
    select 1 from sontu_private.event_instances e
    where e.id=event_participation_access.event_id and e.host_owner_user_id=auth.uid() and e.event_kind='SIMPLE'
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;

  if action='write' then
    if value not in ('ANYONE','SONTU_USERS_ONLY') then return sontu_private.fail('INVALID_INPUT'); end if;
    select participation_access,lifecycle into previous_value,current_lifecycle
      from sontu_private.event_instances where id=event_participation_access.event_id for update;
    if current_lifecycle not in ('DRAFT','PUBLISHED') then return sontu_private.fail('INVALID_STATE'); end if;

    update sontu_private.event_instances set participation_access=value,updated_at=now()
      where id=event_participation_access.event_id;
    if previous_value is distinct from value then
      insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata)
      values(event_id,gen_random_uuid(),auth.uid()::text,'PARTICIPATION_ACCESS_CHANGED',
        jsonb_build_object('previous',previous_value,'current',value,'lifecycle',current_lifecycle));
    end if;
  elsif action<>'read' then return sontu_private.fail('INVALID_INPUT'); end if;

  select participation_access into current_value from sontu_private.event_instances where id=event_participation_access.event_id;
  return jsonb_build_object('status','ready','participation_access',current_value);
end $$;

revoke all on function sontu_private.event_participation_access(text,uuid,text) from public,anon,authenticated;
grant execute on function sontu_private.event_participation_access(text,uuid,text) to authenticated;
revoke all on function public.sontu_event_participation_access(text,uuid,text) from public,anon;
grant execute on function public.sontu_event_participation_access(text,uuid,text) to authenticated;
