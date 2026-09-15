alter table sontu_private.event_participants
  add column invitation_last_sent_at timestamptz,
  add column invitation_provider_message_id text,
  add column invitation_last_error text;

create function sontu_private.invitation_email_delivery(action text,event_id uuid,recipient_email text,token text,outcome text default null,provider_message_id text default null,error_message text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p sontu_private.event_participants; e sontu_private.event_instances; v sontu_private.event_versions;
begin
 if auth.uid() is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into e from sontu_private.event_instances where id=event_id and host_owner_user_id=auth.uid() and event_kind='SIMPLE';
 if not found then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into p from sontu_private.event_participants where event_instance_id=e.id and invitation_email=lower(trim(recipient_email)) and invitation_state='CREATED' and commitment_state='NO_COMMITMENT' and token_revoked_at is null and token_expires_at>now() and token_hash=sha256(convert_to(token,'UTF8'));
 if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 if action='prepare' then return jsonb_build_object('status','ready','recipient_name',p.display_name,'recipient_email',p.invitation_email,'event_title',v.title); end if;
 if action<>'complete' or outcome not in ('SENT','FAILED_RETRYABLE','CONFIGURATION_UNAVAILABLE') then return sontu_private.fail('INVALID_INPUT'); end if;
 update sontu_private.event_participants set invitation_last_sent_at=case when outcome='SENT' then now() else invitation_last_sent_at end, invitation_provider_message_id=case when outcome='SENT' then provider_message_id else invitation_provider_message_id end, invitation_last_error=case when outcome='SENT' then null else left(coalesce(error_message,'Delivery failed.'),500) end where id=p.id;
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,gen_random_uuid(),auth.uid()::text,'INVITATION_EMAIL_'||outcome,jsonb_build_object('participant_id',p.id));
 return jsonb_build_object('status','ready');
end $$;
create function public.sontu_invitation_email_delivery(action text,event_id uuid,recipient_email text,token text,outcome text default null,provider_message_id text default null,error_message text default null) returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.invitation_email_delivery(action,event_id,recipient_email,token,outcome,provider_message_id,error_message) $$;
revoke all on function sontu_private.invitation_email_delivery(text,uuid,text,text,text,text,text),public.sontu_invitation_email_delivery(text,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.sontu_invitation_email_delivery(text,uuid,text,text,text,text,text) to authenticated;
