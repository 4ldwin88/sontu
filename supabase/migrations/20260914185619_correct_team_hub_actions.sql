create or replace function sontu_private.event_team_hub_action(event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare team_role text;
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if exists(select 1 from sontu_private.event_instances e where e.id=event_team_hub_action.event_id and e.host_owner_user_id=auth.uid()) then return jsonb_build_object('status','ready','action','FULL_HOST'); end if;
 select role into team_role from sontu_private.event_team_members m where m.event_instance_id=event_team_hub_action.event_id and m.user_id=auth.uid();
 if team_role in ('CO_HOST','EVENT_MANAGER') then return jsonb_build_object('status','ready','action','OPERATIONS','role',team_role); end if;
 if team_role='CHECK_IN_STAFF' then return jsonb_build_object('status','ready','action','CHECK_IN','role',team_role); end if;
 return sontu_private.fail('UNAUTHORIZED');
end $$;
revoke all on function sontu_private.event_team_hub_action(uuid) from public,anon,authenticated;
