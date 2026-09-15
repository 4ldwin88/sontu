create function sontu_private.event_delivery_recipients(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=auth.uid()) then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','recipients',coalesce((select jsonb_agg(jsonb_build_object('name',x.display_name,'kind',x.kind,'state',x.state) order by x.display_name,x.kind) from (
  select p.display_name,c.kind,o.state from sontu_private.communication_records c join sontu_private.outbox_entries o on o.communication_id=c.id join sontu_private.event_participants p on p.id=c.participant_id where c.event_instance_id=event_id
 ) x),'[]'::jsonb));
end $$;
create function public.sontu_event_delivery_recipients(event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_delivery_recipients(event_id) $$;
revoke all on function sontu_private.event_delivery_recipients(uuid),public.sontu_event_delivery_recipients(uuid) from public,anon;
grant execute on function public.sontu_event_delivery_recipients(uuid) to authenticated;
