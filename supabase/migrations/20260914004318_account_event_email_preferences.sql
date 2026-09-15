-- Account holders choose whether Sontu may send event-related email. This does
-- not suppress mandatory accountless guest RSVP, recovery, or security email.
alter table sontu_private.account_profiles
  add column event_email_enabled boolean not null default true;

alter table sontu_private.communication_records
  drop constraint communication_records_dispatch_state_check,
  add constraint communication_records_dispatch_state_check
    check (dispatch_state in ('PENDING','PROCESSING','SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE','FAILED_PERMANENT','DELIVERED','FAILED','SUPPRESSED'));
alter table sontu_private.outbox_entries
  drop constraint outbox_entries_state_check,
  add constraint outbox_entries_state_check
    check (state in ('PENDING','PROCESSING','SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE','FAILED_PERMANENT','DELIVERED','FAILED','SUPPRESSED'));

create or replace function sontu_private.account_profile(action text, input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); p sontu_private.account_profiles; n text; h text; d text; stem text; attempt integer; event_mail boolean;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('status','denied'); end if;
 perform pg_advisory_xact_lock(hashtextextended('profile:'||uid::text,0));
 select * into p from sontu_private.account_profiles where user_id=uid for update;
 if action='read' then
  if p.user_id is null then return jsonb_build_object('status','empty'); end if;
 elsif action='create' then
  if p.user_id is null then
   n:=btrim(input->>'first_name');
   if n is null or char_length(n) not between 1 and 80 then return jsonb_build_object('status','error','error_code','INVALID_NAME'); end if;
   event_mail:=coalesce((input->>'event_email_enabled')::boolean,true);
   stem:=left(regexp_replace(lower(n),'[^a-z0-9]','','g'),20);
   if stem='' then stem:='member'; end if;
   for attempt in 1..10 loop
    h:=stem||'_'||left(replace(gen_random_uuid()::text,'-',''),8);
    begin
     insert into sontu_private.account_profiles(user_id,first_name,handle,event_email_enabled) values(uid,n,h,event_mail) returning * into p;
     exit;
    exception when unique_violation then if attempt=10 then raise; end if; end;
   end loop;
  end if;
 elsif action='update' then
  if p.user_id is null then return jsonb_build_object('status','empty'); end if;
  if (input->>'revision')::integer is distinct from p.revision then return jsonb_build_object('status','error','error_code','STALE_PROFILE'); end if;
  n:=btrim(input->>'first_name'); d:=btrim(coalesce(input->>'display_name','')); h:=lower(btrim(input->>'handle'));
  event_mail:=coalesce((input->>'event_email_enabled')::boolean,p.event_email_enabled);
  if n is null or char_length(n) not between 1 and 80 or char_length(d)>80 then return jsonb_build_object('status','error','error_code','INVALID_NAME'); end if;
  if h is null or h !~ '^[a-z0-9][a-z0-9_.]{2,29}$' or exists(select 1 from sontu_private.reserved_handles r where r.handle=h) then return jsonb_build_object('status','error','error_code','INVALID_HANDLE'); end if;
  if h<>p.handle and not p.handle_provisional and p.handle_changed_at>now()-interval '30 days' then return jsonb_build_object('status','error','error_code','HANDLE_COOLDOWN'); end if;
  begin
   update sontu_private.account_profiles set first_name=n,display_name=d,handle=h,event_email_enabled=event_mail,
    handle_provisional=case when h<>p.handle then false else p.handle_provisional end,
    handle_changed_at=case when h<>p.handle then now() else p.handle_changed_at end,
    revision=revision+1 where user_id=uid returning * into p;
  exception when unique_violation then return jsonb_build_object('status','error','error_code','HANDLE_UNAVAILABLE'); end;
 else return jsonb_build_object('status','error','error_code','INVALID_ACTION'); end if;
 return jsonb_build_object('status','ready','profile',to_jsonb(p));
end $$;

create or replace function sontu_private.claim_event_email_outbox(event_id uuid, max_rows integer default 25)
returns table(outbox_id uuid,recipient_email text,recipient_name text,kind text,event_title text,starts_at timestamptz,ends_at timestamptz,timezone text,venue_label text)
language plpgsql security definer set search_path='' as $$
begin
  if max_rows not between 1 and 50 then raise exception 'invalid batch size'; end if;
  -- An account holder can opt out before a queued operational update is sent.
  -- Guests do not enter this branch: their email is the required RSVP record.
  update sontu_private.outbox_entries o set state='SUPPRESSED',completed_at=now(),last_error='Recipient disabled account event email.'
  from sontu_private.communication_records c join sontu_private.event_participants p on p.id=c.participant_id
    join sontu_private.account_profiles a on a.user_id=p.participant_user_id
  where o.communication_id=c.id and o.event_instance_id=claim_event_email_outbox.event_id
    and o.state in ('PENDING','FAILED_RETRYABLE') and not a.event_email_enabled;
  update sontu_private.communication_records c set dispatch_state=o.state,last_error=o.last_error
  from sontu_private.outbox_entries o where c.id=o.communication_id and o.event_instance_id=claim_event_email_outbox.event_id and o.state='SUPPRESSED';
  return query with claimed as (
    select o.id from sontu_private.outbox_entries o join sontu_private.communication_records c on c.id=o.communication_id
    where o.event_instance_id=claim_event_email_outbox.event_id and o.state in ('PENDING','FAILED_RETRYABLE') and o.next_attempt_at<=now()
    order by o.next_attempt_at,o.id for update skip locked limit max_rows
  ), updated as (
    update sontu_private.outbox_entries o set state='PROCESSING',claimed_at=now(),attempt_count=o.attempt_count+1 from claimed where o.id=claimed.id returning o.id,o.communication_id
  ) select o.id,p.invitation_email,p.display_name,c.kind,v.title,v.starts_at,v.ends_at,v.timezone,v.venue_label
    from updated u join sontu_private.outbox_entries o on o.id=u.id join sontu_private.communication_records c on c.id=u.communication_id
    join sontu_private.event_participants p on p.id=c.participant_id join sontu_private.event_instances e on e.id=c.event_instance_id
    join sontu_private.event_versions v on v.event_instance_id=e.id and v.version_number=e.current_version_number where p.invitation_email is not null;
end $$;
