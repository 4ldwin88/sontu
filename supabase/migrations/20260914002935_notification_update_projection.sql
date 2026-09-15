-- The notification surface consumes existing event truth. It does not create a
-- second notification ledger or expose participant data beyond the signed-in
-- person's own relationship to an event.
create or replace function sontu_private.my_events() returns jsonb
language plpgsql security definer set search_path='' as $$
declare mail text:=sontu_private.verified_email();
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','events',coalesce((
  select jsonb_agg(x order by x.starts_at nulls last,x.id)
  from (
   select e.id,e.lifecycle,e.event_category as category,e.event_format as format,
    v.title,v.starts_at,v.ends_at,v.description,v.timezone,v.venue_label,v.cover_key,v.capacity,
    e.host_owner_user_id=auth.uid() as hosting,p.commitment_state,p.invitation_state,
    exists(
      select 1
      from sontu_private.participant_reconfirmations r
      join sontu_private.consequence_cases c on c.id=r.consequence_case_id
      where r.event_participant_id=p.id
        and r.state='AWAITING_RESPONSE'
        and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL')
    ) as reconfirmation_required,
    oc.owner_kind,case when oc.owner_kind='ORGANIZATION' then o.display_name else 'Personal' end as owner_name
   from sontu_private.event_instances e
   join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
   join sontu_private.event_owner_contexts oc on oc.event_instance_id=e.id
   left join sontu_private.organizations o on o.id=oc.organization_id
   left join sontu_private.event_participants p on p.event_instance_id=e.id and (
     p.participant_user_id=auth.uid()
     or (p.participant_user_id is null and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now())
   )
   where e.event_kind='SIMPLE'
     and (e.host_owner_user_id=auth.uid() or (p.id is not null and e.lifecycle<>'DRAFT'))
  ) x
 ),'[]'::jsonb));
end $$;
