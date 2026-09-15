-- Admission is the future-proof entitlement layer. RSVP remains a participant
-- relationship; a credential is only its presentation mechanism.
create table sontu_private.event_admissions (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references sontu_private.event_instances(id) on delete cascade,
  event_participant_id uuid not null unique references sontu_private.event_participants(id) on delete cascade,
  source_kind text not null default 'RSVP' check (source_kind in ('RSVP','ORDER','COMPLIMENTARY')),
  status text not null default 'VALID' check (status in ('PENDING','VALID','USED','REVOKED','CANCELLED_EVENT_INVALID','REFUNDED_INVALID','EXPIRED')),
  issued_at timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index event_admissions_event_participant_idx on sontu_private.event_admissions(event_instance_id,event_participant_id);
alter table sontu_private.event_admissions enable row level security;

create table sontu_private.event_credentials (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references sontu_private.event_admissions(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ROTATED','REVOKED','EXPIRED')),
  token_hash bytea not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);
alter table sontu_private.event_credentials enable row level security;

-- Confirmed free RSVPs are admitted immediately; later paid orders can issue
-- the same entitlement only after their provider-backed payment succeeds.
insert into sontu_private.event_admissions(event_instance_id,event_participant_id,source_kind,status)
select p.event_instance_id,p.id,'RSVP','VALID'
from sontu_private.event_participants p
join sontu_private.event_instances e on e.id=p.event_instance_id
where p.commitment_state='CONFIRMED' and e.lifecycle not in ('CANCELLED','COMPLETED')
on conflict(event_participant_id) do nothing;

create function sontu_private.sync_rsvp_admission() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.commitment_state='CONFIRMED' then
    insert into sontu_private.event_admissions(event_instance_id,event_participant_id,source_kind,status)
    values(new.event_instance_id,new.id,'RSVP','VALID')
    on conflict(event_participant_id) do update set status='VALID',invalidated_at=null,updated_at=now();
  elsif old.commitment_state='CONFIRMED' and new.commitment_state<>'CONFIRMED' then
    update sontu_private.event_admissions set status='REVOKED',invalidated_at=now(),updated_at=now()
    where event_participant_id=new.id and source_kind='RSVP' and status in ('PENDING','VALID');
  end if;
  return new;
end $$;
create trigger sync_rsvp_admission after insert or update of commitment_state on sontu_private.event_participants for each row execute function sontu_private.sync_rsvp_admission();
revoke all on function sontu_private.sync_rsvp_admission() from public,anon,authenticated;
