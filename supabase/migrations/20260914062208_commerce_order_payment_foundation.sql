-- Commerce plumbing only: no price, checkout, provider credential, or buyer UI.
-- Payment transitions are an authority boundary for a future verified provider
-- or back-office integration; browser clients receive no mutation endpoint.
create table sontu_private.event_orders (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  event_participant_id uuid not null unique references sontu_private.event_participants(id) on delete cascade,
  state text not null default 'PENDING' check (state in ('PENDING','FAILED','PAID','REFUNDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  unique(event_instance_id,event_participant_id)
);
create index event_orders_event_state_idx on sontu_private.event_orders(event_instance_id,state);
alter table sontu_private.event_orders enable row level security;
revoke all on sontu_private.event_orders from anon,authenticated;

create table sontu_private.event_payment_state_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sontu_private.event_orders(id) on delete cascade,
  prior_state text,
  state text not null check (state in ('PENDING','FAILED','PAID','REFUNDED')),
  source_kind text not null check (source_kind in ('PROVIDER','BACKOFFICE')),
  external_reference text,
  recorded_at timestamptz not null default now(),
  unique(order_id,state,external_reference)
);
alter table sontu_private.event_payment_state_history enable row level security;
revoke all on sontu_private.event_payment_state_history from anon,authenticated;

create function sontu_private.sync_order_admission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state='PAID' then
    insert into sontu_private.event_admissions(event_instance_id,event_participant_id,source_kind,status)
    values(new.event_instance_id,new.event_participant_id,'ORDER','VALID')
    on conflict(event_participant_id) do update
      set source_kind=case when sontu_private.event_admissions.source_kind='RSVP' then 'RSVP' else 'ORDER' end,
          status=case when sontu_private.event_admissions.source_kind='RSVP' then sontu_private.event_admissions.status else 'VALID' end,
          invalidated_at=case when sontu_private.event_admissions.source_kind='RSVP' then sontu_private.event_admissions.invalidated_at else null end,
          updated_at=now();
  elsif old.state='PAID' and new.state in ('REFUNDED','FAILED') then
    update sontu_private.event_admissions set status='REFUNDED_INVALID',invalidated_at=now(),updated_at=now()
      where event_participant_id=new.event_participant_id and source_kind='ORDER' and status in ('PENDING','VALID');
    update sontu_private.event_credentials c set status='REVOKED',replaced_at=now()
      from sontu_private.event_admissions a where c.admission_id=a.id and a.event_participant_id=new.event_participant_id and c.status='ACTIVE';
  end if;
  return new;
end $$;
create trigger sync_order_admission after insert or update of state on sontu_private.event_orders
for each row execute function sontu_private.sync_order_admission();
revoke all on function sontu_private.sync_order_admission() from public,anon,authenticated;
