create function sontu_private.participant_seating(event_id uuid,token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p sontu_private.event_participants; e sontu_private.event_instances;
begin
  if token is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into p from sontu_private.event_participants
  where event_instance_id=participant_seating.event_id and token_hash=sha256(convert_to(token,'UTF8'))
    and token_revoked_at is null and token_expires_at>now() and commitment_state='CONFIRMED';
  if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into e from sontu_private.event_instances where id=p.event_instance_id and event_kind='SIMPLE';
  if not found or e.lifecycle in ('DRAFT','CANCELLED') then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  return jsonb_build_object('status','ready','assignments',coalesce((
    select jsonb_agg(jsonb_build_object('attendee_name',a.attendee_name,'table_label',t.label) order by a.attendee_name)
    from sontu_private.event_seating_assignments a join sontu_private.event_seating_tables t on t.id=a.seating_table_id
    where a.event_participant_id=p.id
  ),'[]'::jsonb));
end $$;
create function public.sontu_participant_seating(event_id uuid,token text)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.participant_seating(event_id,token) $$;
revoke all on function sontu_private.participant_seating(uuid,text),public.sontu_participant_seating(uuid,text) from public;
grant execute on function public.sontu_participant_seating(uuid,text) to anon,authenticated;
