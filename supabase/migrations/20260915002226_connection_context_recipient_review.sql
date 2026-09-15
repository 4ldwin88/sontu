create function sontu_private.connection_context_recipients(context_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('status','denied'); end if;
 if not exists(select 1 from sontu_private.connection_contexts x where x.id=context_id and x.owner_user_id=uid) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ready','recipients',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',coalesce(nullif(p.display_name,''),p.first_name),'email',u.email) order by coalesce(nullif(p.display_name,''),p.first_name)) from sontu_private.connection_context_members m join sontu_private.account_profiles p on p.user_id=m.member_user_id join auth.users u on u.id=m.member_user_id where m.context_id=$1),'[]'::jsonb));
end $$;
revoke all on function sontu_private.connection_context_recipients(uuid) from public;
grant execute on function sontu_private.connection_context_recipients(uuid) to authenticated;
create function public.sontu_connection_context_recipients(context_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.connection_context_recipients(context_id) $$;
revoke all on function public.sontu_connection_context_recipients(uuid) from public;
grant execute on function public.sontu_connection_context_recipients(uuid) to authenticated;
