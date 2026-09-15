-- Preserve the established nullable projection contract while the private
-- projection also carries admission state.
create or replace function public.sontu_host_projection(event_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select case
    when result #>> '{data,suggestion,id}' is null
      then jsonb_set(result,'{data,suggestion}','null'::jsonb)
    else result
  end
  from (select sontu_private.host_projection(event_id) as result) projection
$$;
revoke all on function public.sontu_host_projection(uuid) from public,anon;
grant execute on function public.sontu_host_projection(uuid) to authenticated;
