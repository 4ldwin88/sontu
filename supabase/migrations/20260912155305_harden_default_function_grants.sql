-- Supabase's initial auto-RLS event-trigger function is not a client RPC.
-- Preserve its event-trigger behavior while removing unnecessary API execution.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
