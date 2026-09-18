create function sontu_private.connection_context_maintenance(action text, input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  context_id uuid;
  clean_name text;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  begin
    context_id := (input->>'context_id')::uuid;
  exception when others then
    return sontu_private.fail('INVALID_INPUT');
  end;
  if not exists (
    select 1 from sontu_private.connection_contexts c
    where c.id = context_id and c.owner_user_id = actor
  ) then return sontu_private.fail('CONTEXT_NOT_FOUND'); end if;

  if action = 'rename' then
    clean_name := nullif(btrim(input->>'name'), '');
    if clean_name is null or char_length(clean_name) > 80 then
      return sontu_private.fail('INVALID_INPUT');
    end if;
    update sontu_private.connection_contexts set name = clean_name where id = context_id;
  elsif action = 'delete' then
    delete from sontu_private.connection_contexts where id = context_id;
  else
    return sontu_private.fail('INVALID_INPUT');
  end if;
  return jsonb_build_object('status','ready','context_id',context_id);
end
$$;

create function public.sontu_connection_context_maintenance(action text, input jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select sontu_private.connection_context_maintenance(action,input)
$$;

revoke all on function sontu_private.connection_context_maintenance(text,jsonb),
  public.sontu_connection_context_maintenance(text,jsonb)
  from public, anon, authenticated;
grant execute on function sontu_private.connection_context_maintenance(text,jsonb),
  public.sontu_connection_context_maintenance(text,jsonb)
  to authenticated;
