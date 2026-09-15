-- Application email is an event-side delivery record, not evidence of attendance,
-- reconfirmation or an account. Existing core-fixture rows remain represented but
-- now share a truthful delivery lifecycle with SIMPLE events.

alter table sontu_private.communication_records
  alter column material_change_id drop not null,
  add column kind text not null default 'EVENT_CHANGE'
    check (kind in ('EVENT_CHANGE','GUEST_RSVP_CONFIRMATION','EVENT_CANCELLED')),
  add column provider_message_id text,
  add column last_error text,
  add column dispatched_at timestamptz;

-- Core-fixture delivery stays explicitly simulated; SIMPLE event messages are
-- eligible for the actual provider pipeline.
alter table sontu_private.communication_records
  drop constraint communication_records_is_simulated_check,
  alter column is_simulated set default false;

create function sontu_private.normalize_communication_simulation()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  new.is_simulated := not exists (
    select 1 from sontu_private.event_instances e
    where e.id=new.event_instance_id and e.event_kind='SIMPLE'
  );
  return new;
end $$;

create trigger normalize_communication_simulation
before insert on sontu_private.communication_records
for each row execute function sontu_private.normalize_communication_simulation();

alter table sontu_private.communication_records
  drop constraint communication_records_dispatch_state_check,
  add constraint communication_records_dispatch_state_check
    check (dispatch_state in ('PENDING','PROCESSING','SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE','FAILED_PERMANENT','DELIVERED','FAILED'));

alter table sontu_private.outbox_entries
  drop constraint outbox_entries_state_check,
  add constraint outbox_entries_state_check
    check (state in ('PENDING','PROCESSING','SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE','FAILED_PERMANENT','DELIVERED','FAILED')),
  add column next_attempt_at timestamptz not null default now(),
  add column claimed_at timestamptz,
  add column completed_at timestamptz,
  add column provider_message_id text,
  add column last_error text;

update sontu_private.communication_records
set dispatch_state = case dispatch_state when 'DELIVERED' then 'SENT' when 'FAILED' then 'FAILED_RETRYABLE' else 'PENDING' end;
update sontu_private.outbox_entries
set state = case state when 'DELIVERED' then 'SENT' when 'FAILED' then 'FAILED_RETRYABLE' else 'PENDING' end;

create unique index communication_guest_rsvp_once
  on sontu_private.communication_records(event_instance_id,participant_id,kind)
  where kind='GUEST_RSVP_CONFIRMATION';
create unique index communication_cancel_once
  on sontu_private.communication_records(event_instance_id,participant_id,kind)
  where kind='EVENT_CANCELLED';
create index outbox_dispatch_ready
  on sontu_private.outbox_entries(event_instance_id,next_attempt_at,id)
  where state in ('PENDING','FAILED_RETRYABLE');

create function sontu_private.queue_guest_rsvp_confirmation()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare communication uuid;
begin
  if new.commitment_state <> 'CONFIRMED'
    or (tg_op='UPDATE' and old.commitment_state='CONFIRMED')
    or new.invitation_email is null
    or new.participant_user_id is not null then
    return new;
  end if;
  if not exists (
    select 1 from sontu_private.event_instances e
    where e.id=new.event_instance_id and e.event_kind='SIMPLE' and e.lifecycle='PUBLISHED'
  ) then return new; end if;
  insert into sontu_private.communication_records(event_instance_id,material_change_id,participant_id,kind)
  values(new.event_instance_id,null,new.id,'GUEST_RSVP_CONFIRMATION')
  on conflict do nothing
  returning id into communication;
  if communication is not null then
    insert into sontu_private.outbox_entries(event_instance_id,communication_id)
    values(new.event_instance_id,communication);
  end if;
  return new;
end $$;

create trigger queue_guest_rsvp_confirmation
after insert or update of commitment_state on sontu_private.event_participants
for each row execute function sontu_private.queue_guest_rsvp_confirmation();

create function sontu_private.queue_event_cancellation_messages()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if old.lifecycle='PUBLISHED' and new.lifecycle='CANCELLED' and new.event_kind='SIMPLE' then
    insert into sontu_private.communication_records(event_instance_id,material_change_id,participant_id,kind)
    select new.id,null,p.id,'EVENT_CANCELLED'
    from sontu_private.event_participants p
    where p.event_instance_id=new.id and p.commitment_state='CONFIRMED' and p.invitation_email is not null
    on conflict do nothing;
    insert into sontu_private.outbox_entries(event_instance_id,communication_id)
    select c.event_instance_id,c.id
    from sontu_private.communication_records c
    left join sontu_private.outbox_entries o on o.communication_id=c.id
    where c.event_instance_id=new.id and c.kind='EVENT_CANCELLED' and o.id is null;
  end if;
  return new;
end $$;

create trigger queue_event_cancellation_messages
after update of lifecycle on sontu_private.event_instances
for each row execute function sontu_private.queue_event_cancellation_messages();

create function sontu_private.event_delivery_projection(event_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=auth.uid()
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','summary',coalesce((
    select jsonb_agg(jsonb_build_object('kind',x.kind,'state',x.state,'count',x.count) order by x.kind,x.state)
    from (
      select c.kind,o.state,count(*)::int as count
      from sontu_private.communication_records c join sontu_private.outbox_entries o on o.communication_id=c.id
      where c.event_instance_id=event_id group by c.kind,o.state
    ) x
  ),'[]'::jsonb));
end $$;

create function public.sontu_event_delivery_projection(event_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.event_delivery_projection(event_id) $$;
revoke all on function sontu_private.event_delivery_projection(uuid),public.sontu_event_delivery_projection(uuid) from public,anon;
grant execute on function public.sontu_event_delivery_projection(uuid) to authenticated;

create function sontu_private.request_event_delivery(event_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare queued integer;
begin
  if auth.uid() is null or not exists (
    select 1 from sontu_private.event_instances e where e.id=event_id and e.host_owner_user_id=auth.uid()
  ) then return sontu_private.fail('UNAUTHORIZED'); end if;
  update sontu_private.outbox_entries o set state='PENDING',next_attempt_at=now(),last_error=null
  from sontu_private.communication_records c
  where o.communication_id=c.id and c.event_instance_id=event_id and o.state in ('FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE');
  get diagnostics queued = row_count;
  return jsonb_build_object('status','ready','event_id',event_id,'released_for_delivery',queued);
end $$;

create function public.sontu_request_event_delivery(event_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.request_event_delivery(event_id) $$;
revoke all on function sontu_private.request_event_delivery(uuid),public.sontu_request_event_delivery(uuid) from public,anon;
grant execute on function public.sontu_request_event_delivery(uuid) to authenticated;

create function sontu_private.claim_event_email_outbox(event_id uuid, max_rows integer default 25)
returns table(outbox_id uuid,recipient_email text,recipient_name text,kind text,event_title text,starts_at timestamptz,ends_at timestamptz,timezone text,venue_label text)
language plpgsql security definer set search_path=''
as $$
begin
  if max_rows not between 1 and 50 then raise exception 'invalid batch size'; end if;
  return query
  with claimed as (
    select o.id
    from sontu_private.outbox_entries o join sontu_private.communication_records c on c.id=o.communication_id
    where o.event_instance_id=claim_event_email_outbox.event_id
      and o.state in ('PENDING','FAILED_RETRYABLE') and o.next_attempt_at<=now()
    order by o.next_attempt_at,o.id for update skip locked limit max_rows
  ), updated as (
    update sontu_private.outbox_entries o set state='PROCESSING',claimed_at=now(),attempt_count=o.attempt_count+1
    from claimed where o.id=claimed.id returning o.id,o.communication_id
  )
  select o.id,p.invitation_email,p.display_name,c.kind,v.title,v.starts_at,v.ends_at,v.timezone,v.venue_label
  from updated u join sontu_private.outbox_entries o on o.id=u.id
    join sontu_private.communication_records c on c.id=u.communication_id
    join sontu_private.event_participants p on p.id=c.participant_id
    join sontu_private.event_instances e on e.id=c.event_instance_id
    join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number
  where p.invitation_email is not null;
end $$;

create function sontu_private.complete_event_email_outbox(outbox_id uuid, outcome text, provider_message_id text default null, error_message text default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if outcome not in ('SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE','FAILED_PERMANENT') then raise exception 'invalid outcome'; end if;
  update sontu_private.outbox_entries o set state=outcome,completed_at=case when outcome='SENT' then now() else null end,
    provider_message_id=complete_event_email_outbox.provider_message_id,last_error=left(complete_event_email_outbox.error_message,500),
    next_attempt_at=case when outcome='FAILED_RETRYABLE' then now()+interval '15 minutes' else next_attempt_at end
  where o.id=complete_event_email_outbox.outbox_id and o.state='PROCESSING';
  update sontu_private.communication_records c set dispatch_state=o.state,provider_message_id=o.provider_message_id,last_error=o.last_error,
    dispatched_at=case when o.state='SENT' then now() else c.dispatched_at end
  from sontu_private.outbox_entries o where c.id=o.communication_id and o.id=complete_event_email_outbox.outbox_id;
end $$;

create function public.sontu_claim_event_email_outbox(event_id uuid,max_rows integer default 25)
returns table(outbox_id uuid,recipient_email text,recipient_name text,kind text,event_title text,starts_at timestamptz,ends_at timestamptz,timezone text,venue_label text)
language sql security invoker set search_path=''
as $$ select * from sontu_private.claim_event_email_outbox(event_id,max_rows) $$;
create function public.sontu_complete_event_email_outbox(outbox_id uuid,outcome text,provider_message_id text default null,error_message text default null)
returns void language sql security invoker set search_path=''
as $$ select sontu_private.complete_event_email_outbox(outbox_id,outcome,provider_message_id,error_message) $$;
revoke all on function sontu_private.claim_event_email_outbox(uuid,integer),sontu_private.complete_event_email_outbox(uuid,text,text,text),public.sontu_claim_event_email_outbox(uuid,integer),public.sontu_complete_event_email_outbox(uuid,text,text,text) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
    grant execute on function public.sontu_claim_event_email_outbox(uuid,integer),public.sontu_complete_event_email_outbox(uuid,text,text,text) to service_role;
  end if;
end $$;
