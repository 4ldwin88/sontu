grant execute on function sontu_private.guest_hub_access(uuid,uuid) to anon, authenticated;
grant execute on function public.sontu_guest_hub_access(uuid,uuid) to anon, authenticated;

grant execute on function sontu_private.event_accessibility(text,uuid,text,jsonb) to anon, authenticated;
grant execute on function public.sontu_event_accessibility(text,uuid,text,jsonb) to anon, authenticated;
