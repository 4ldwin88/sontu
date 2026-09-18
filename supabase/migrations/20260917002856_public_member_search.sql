create function sontu_private.member_search(search_query text)
returns jsonb language plpgsql security definer set search_path='' stable as $$
declare clean text:=lower(btrim(search_query));
begin
 if char_length(clean)<2 then return jsonb_build_object('status','ready','members','[]'::jsonb); end if;
 return jsonb_build_object('status','ready','members',coalesce((
  select jsonb_agg(jsonb_build_object('handle',p.handle,'display_name',coalesce(nullif(p.display_name,''),p.first_name),'avatar_path',p.avatar_path)
    order by case when lower(p.handle)=clean then 0 else 1 end,coalesce(nullif(p.display_name,''),p.first_name),p.handle)
  from (select p.* from sontu_private.account_profiles p where p.handle is not null and (lower(p.handle) like '%'||clean||'%' or lower(coalesce(nullif(p.display_name,''),p.first_name)) like '%'||clean||'%') limit 20) p
 ),'[]'::jsonb));
end $$;
create function public.sontu_member_search(search_query text) returns jsonb language sql security invoker set search_path='' stable as $$ select sontu_private.member_search(search_query) $$;
revoke all on function sontu_private.member_search(text),public.sontu_member_search(text) from public,anon,authenticated;
grant execute on function sontu_private.member_search(text),public.sontu_member_search(text) to anon,authenticated;
