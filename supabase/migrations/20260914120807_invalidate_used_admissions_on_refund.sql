-- A refund invalidates the admission even if it was already used. Attendance
-- history remains in event_check_ins; entitlement truth must not stay USED.
create or replace function sontu_private.sync_order_admission() returns trigger
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
      where event_participant_id=new.event_participant_id and source_kind='ORDER'
        and status in ('PENDING','VALID','USED');
    update sontu_private.event_credentials c set status='REVOKED',replaced_at=now()
      from sontu_private.event_admissions a where c.admission_id=a.id
        and a.event_participant_id=new.event_participant_id and c.status='ACTIVE';
  end if;
  return new;
end $$;
revoke all on function sontu_private.sync_order_admission() from public,anon,authenticated;
