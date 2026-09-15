revoke all on function public.sontu_connections(text,jsonb) from public, anon, authenticated;
revoke all on function public.sontu_connection_context_recipients(uuid) from public, anon, authenticated;

grant execute on function public.sontu_connections(text,jsonb) to authenticated;
grant execute on function public.sontu_connection_context_recipients(uuid) to authenticated;
