create table sontu_private.event_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  notification_key text not null check(char_length(notification_key) between 1 and 100),
  read_at timestamptz not null default now(),
  primary key(user_id,event_instance_id,notification_key)
);
alter table sontu_private.event_notification_reads enable row level security;
revoke all on sontu_private.event_notification_reads from public,anon,authenticated;

create function sontu_private.event_notification_state(action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); unread integer;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 if action not in ('read','mark_all') then return sontu_private.fail('INVALID_INPUT'); end if;
 if action='mark_all' then
   insert into sontu_private.event_notification_reads(user_id,event_instance_id,notification_key)
   select actor,e.id,
     case
       when p.invitation_state='CREATED' and p.commitment_state='NO_COMMITMENT' then 'INVITE'
       when e.lifecycle='CANCELLED' then 'CANCELLED'
       when e.lifecycle='COMPLETED' then 'COMPLETED'
       else 'RECONFIRM:'||e.current_version_number::text
     end
   from sontu_private.event_instances e
   join sontu_private.event_participants p on p.event_instance_id=e.id and p.participant_user_id=actor
   where (p.invitation_state='CREATED' and p.commitment_state='NO_COMMITMENT')
      or (p.commitment_state='CONFIRMED' and (
        e.lifecycle in ('CANCELLED','COMPLETED')
        or exists(select 1 from sontu_private.participant_reconfirmations r join sontu_private.consequence_cases c on c.id=r.consequence_case_id where r.event_participant_id=p.id and r.state='AWAITING_RESPONSE' and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL'))
      ))
   on conflict do nothing;
 end if;
 select count(*)::integer into unread from (
   select e.id,
     case
       when p.invitation_state='CREATED' and p.commitment_state='NO_COMMITMENT' then 'INVITE'
       when e.lifecycle='CANCELLED' then 'CANCELLED'
       when e.lifecycle='COMPLETED' then 'COMPLETED'
       else 'RECONFIRM:'||e.current_version_number::text
     end notification_key
   from sontu_private.event_instances e
   join sontu_private.event_participants p on p.event_instance_id=e.id and p.participant_user_id=actor
   where (p.invitation_state='CREATED' and p.commitment_state='NO_COMMITMENT')
      or (p.commitment_state='CONFIRMED' and (
        e.lifecycle in ('CANCELLED','COMPLETED')
        or exists(select 1 from sontu_private.participant_reconfirmations r join sontu_private.consequence_cases c on c.id=r.consequence_case_id where r.event_participant_id=p.id and r.state='AWAITING_RESPONSE' and c.disposition in ('OPEN_UNRESOLVED','PENDING_EXTERNAL'))
      ))
 ) n where not exists(select 1 from sontu_private.event_notification_reads x where x.user_id=actor and x.event_instance_id=n.id and x.notification_key=n.notification_key);
 return jsonb_build_object('status','ready','unread_count',unread);
end $$;

create function public.sontu_event_notification_state(action text)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_notification_state(action) $$;
revoke all on function sontu_private.event_notification_state(text),public.sontu_event_notification_state(text) from public,anon,authenticated;
grant execute on function sontu_private.event_notification_state(text),public.sontu_event_notification_state(text) to authenticated;
