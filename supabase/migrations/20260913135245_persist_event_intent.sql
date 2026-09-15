-- Persist the creation-flow classification so cards are consistent across devices.
alter table sontu_private.event_instances
  add column event_category text,
  add column event_format text;

alter table sontu_private.event_instances
  add constraint event_instances_category_length
    check (event_category is null or length(trim(event_category)) between 1 and 80),
  add constraint event_instances_format_check
    check (event_format is null or event_format in ('in-person', 'online', 'hybrid'));

create function sontu_private.set_event_intent(
  event_id uuid,
  event_category text,
  event_format text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return sontu_private.fail('UNAUTHORIZED');
  end if;
  if length(trim(coalesce(event_category, ''))) not between 1 and 80
    or event_format not in ('in-person', 'online', 'hybrid') then
    return sontu_private.fail('INVALID_INPUT');
  end if;

  update sontu_private.event_instances
  set event_category = trim(set_event_intent.event_category),
      event_format = set_event_intent.event_format,
      updated_at = now()
  where id = set_event_intent.event_id
    and host_owner_user_id = auth.uid()
    and lifecycle = 'DRAFT'
    and event_kind = 'SIMPLE';

  if not found then
    return sontu_private.fail('UNAUTHORIZED');
  end if;
  return jsonb_build_object('status', 'ready', 'event_id', event_id);
end
$$;
revoke all on function sontu_private.set_event_intent(uuid,text,text) from public, anon, authenticated;

create function public.sontu_set_event_intent(
  event_id uuid,
  event_category text,
  event_format text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select sontu_private.set_event_intent(event_id, event_category, event_format)
$$;
revoke all on function public.sontu_set_event_intent(uuid,text,text) from public, anon;
grant execute on function public.sontu_set_event_intent(uuid,text,text) to authenticated;

create or replace function sontu_private.my_events() returns jsonb
language plpgsql security definer set search_path='' as $$
declare mail text:=sontu_private.verified_email();
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready','events',coalesce((select jsonb_agg(x order by x.starts_at nulls last,x.id) from (
  select e.id,e.lifecycle,e.event_category as category,e.event_format as format,
   v.title,v.starts_at,v.timezone,v.venue_label,v.cover_key,
   e.host_owner_user_id=auth.uid() as hosting,p.commitment_state,p.invitation_state
  from sontu_private.event_instances e join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  left join sontu_private.event_participants p on p.event_instance_id=e.id and p.invitation_email=mail and p.token_revoked_at is null and p.token_expires_at>now()
  where e.event_kind='SIMPLE' and (e.host_owner_user_id=auth.uid() or (p.id is not null and e.lifecycle<>'DRAFT'))
 ) x),'[]'));
end $$;
