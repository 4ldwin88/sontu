create or replace function sontu_private.participant_accommodation(action text,event_id uuid,token text,content text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p sontu_private.event_participants; e sontu_private.event_instances; v sontu_private.event_versions; r sontu_private.event_accommodation_requests; clean text:=nullif(btrim(content),'');
begin
 select * into e from sontu_private.event_instances where id=participant_accommodation.event_id and event_kind='SIMPLE';
 if not found then return sontu_private.fail('INVALID_INPUT'); end if;
 select * into v from sontu_private.event_versions where event_instance_id=e.id and version_number=e.current_version_number;
 select * into p from sontu_private.event_participants ep
 where ep.event_instance_id=participant_accommodation.event_id
   and ep.commitment_state='CONFIRMED'
   and (
     (actor is not null and ep.participant_user_id=actor)
     or (
       token is not null
       and ep.token_hash=sha256(convert_to(token,'UTF8'))
       and ep.token_revoked_at is null
       and ep.token_expires_at>now()
     )
   )
 order by (ep.participant_user_id=actor) desc
 limit 1;
 if not found then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 perform sontu_private.purge_expired_accommodation_content();
 select * into r from sontu_private.event_accommodation_requests where event_participant_id=p.id;
 if action='SAVE' then
   if v.starts_at<=now() or char_length(clean) not between 1 and 1000 then return sontu_private.fail('INVALID_INPUT'); end if;
   insert into sontu_private.event_accommodation_requests(event_instance_id,event_participant_id,request_content,status)
   values(e.id,p.id,clean,'OPEN')
   on conflict(event_participant_id) do update set request_content=excluded.request_content,status='OPEN',updated_at=now(),withdrawn_at=null,content_deleted_at=null;
 elsif action='WITHDRAW' then
   if v.starts_at<=now() then return sontu_private.fail('INVALID_STATE'); end if;
   update sontu_private.event_accommodation_requests set request_content=null,status='WITHDRAWN',withdrawn_at=now(),content_deleted_at=now(),updated_at=now() where event_participant_id=p.id;
 elsif action<>'READ' then
   return sontu_private.fail('INVALID_INPUT');
 end if;
 select * into r from sontu_private.event_accommodation_requests where event_participant_id=p.id;
 return jsonb_build_object('status','ready','request',case when r.id is null then null else jsonb_build_object('content',r.request_content,'status',r.status,'updated_at',r.updated_at) end);
end $$;
