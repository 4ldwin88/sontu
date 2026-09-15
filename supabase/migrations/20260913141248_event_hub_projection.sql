-- Authenticated Event Hub projection. Event access and public role presentation
-- are decided server-side so clients cannot recover hidden team roles.
create function sontu_private.event_hub(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); mail text:=sontu_private.verified_email();
  e sontu_private.event_instances; v sontu_private.event_versions;
  participant sontu_private.event_participants; is_host boolean;
begin
  if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
  select * into e from sontu_private.event_instances where id=event_hub.event_id;
  if not found or e.event_kind<>'SIMPLE' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  is_host:=e.host_owner_user_id=actor;
  if not is_host then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=e.id and p.invitation_email=mail
      and p.token_revoked_at is null and p.token_expires_at>now();
    if participant.id is null or e.lifecycle='DRAFT' then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  end if;
  select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
  return jsonb_build_object('status','ready',
    'event',jsonb_build_object(
      'id',e.id,'title',v.title,'description',v.description,'starts_at',v.starts_at,'ends_at',v.ends_at,
      'timezone',v.timezone,'venue_label',v.venue_label,'cover_key',v.cover_key,'capacity',v.capacity,
      'lifecycle',e.lifecycle,'current_version',e.current_version_number,
      'category',coalesce(e.event_category,'Event'),'format',coalesce(e.event_format,'in-person')),
    'viewer',jsonb_build_object(
      'hosting',is_host,'display_name',participant.display_name,'commitment_state',participant.commitment_state,
      'invitation_state',participant.invitation_state),
    'host',(
      select jsonb_build_object('display_name',coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)))
      from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id where u.id=e.host_owner_user_id),
    'going',coalesce((
      select jsonb_agg(g order by g.sort_order,g.display_name) from (
        select 0 as sort_order,
          coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)) as display_name,
          'Host'::text as badge
        from auth.users u left join sontu_private.account_profiles ap on ap.user_id=u.id
        where u.id=e.host_owner_user_id
        union all
        select 1,coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)),
          case when m.public_visibility='PUBLIC_ROLE' then initcap(replace(m.role,'_',' ')) else 'Event team' end
        from sontu_private.event_team_members m join auth.users u on u.id=m.user_id
        left join sontu_private.account_profiles ap on ap.user_id=m.user_id
        where m.event_instance_id=e.id and m.attends_event and m.public_visibility<>'HIDDEN'
        union all
        select 2,p.display_name,null::text
        from sontu_private.event_participants p
        where p.event_instance_id=e.id and p.commitment_state='CONFIRMED'
      ) g
    ),'[]'::jsonb));
end $$;
revoke all on function sontu_private.event_hub(uuid) from public,anon,authenticated;
grant execute on function sontu_private.event_hub(uuid) to authenticated;

create function public.sontu_event_hub(event_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select sontu_private.event_hub(event_id)
$$;
revoke all on function public.sontu_event_hub(uuid) from public,anon;
grant execute on function public.sontu_event_hub(uuid) to authenticated;
