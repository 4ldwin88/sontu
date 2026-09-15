-- Credentials remain private presentation records.  They are issued by the
-- database only after an admission has become valid; neither their token hash
-- nor a bearer token is returned to a browser projection.
create function sontu_private.sync_admission_credential() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='VALID' then
    if not exists (
      select 1 from sontu_private.event_credentials c
      where c.admission_id=new.id and c.status='ACTIVE'
    ) then
      insert into sontu_private.event_credentials(admission_id,status,token_hash)
      values(
        new.id,
        'ACTIVE',
        sha256(convert_to(gen_random_uuid()::text,'UTF8'))
      );
    end if;
  elsif new.status in ('REVOKED','CANCELLED_EVENT_INVALID','REFUNDED_INVALID','EXPIRED') then
    update sontu_private.event_credentials
      set status='REVOKED',replaced_at=coalesce(replaced_at,now())
      where admission_id=new.id and status='ACTIVE';
  end if;
  return new;
end $$;

create trigger sync_admission_credential
after insert or update of status on sontu_private.event_admissions
for each row execute function sontu_private.sync_admission_credential();

-- Existing valid admissions receive exactly one active, server-generated
-- credential. Existing invalid admissions never become newly presentable.
insert into sontu_private.event_credentials(admission_id,status,token_hash)
select a.id,'ACTIVE',sha256(convert_to(gen_random_uuid()::text,'UTF8'))
from sontu_private.event_admissions a
where a.status in ('VALID','USED')
  and not exists (
    select 1 from sontu_private.event_credentials c
    where c.admission_id=a.id and c.status='ACTIVE'
  );

create or replace function sontu_private.participant_admission_projection(event_id uuid, manage_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); participant sontu_private.event_participants; admission sontu_private.event_admissions; credential sontu_private.event_credentials;
begin
  if manage_token is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id
        and p.token_hash=sha256(convert_to(manage_token::text,'UTF8'))
        and p.participant_user_id is null and p.token_revoked_at is null and p.token_expires_at>now();
  elsif actor is not null then
    select * into participant from sontu_private.event_participants p
      where p.event_instance_id=participant_admission_projection.event_id and p.participant_user_id=actor;
  end if;
  if participant.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
  select * into admission from sontu_private.event_admissions a where a.event_participant_id=participant.id;
  select * into credential from sontu_private.event_credentials c
    where c.admission_id=admission.id order by c.created_at desc limit 1;
  return jsonb_build_object('status','ready','admission',jsonb_build_object(
    'status',coalesce(admission.status,'PENDING'),'issued_at',admission.issued_at,
    'invalidated_at',admission.invalidated_at,'can_enter',admission.status='VALID',
    'credential_status',coalesce(credential.status,'NOT_ISSUED'),
    'credential_expires_at',credential.expires_at));
end $$;

revoke all on function sontu_private.sync_admission_credential(),sontu_private.participant_admission_projection(uuid,uuid) from public,anon,authenticated;
