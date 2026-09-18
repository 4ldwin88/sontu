-- Closing a discussion blocks new posts but preserves its visible event history
-- for confirmed participants.
create or replace function sontu_private.event_discussion(action text,event_id uuid,post_id uuid default null,body text default null,enabled boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; p sontu_private.event_discussion_posts;
begin
 if actor is null then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into e from sontu_private.event_instances where id=event_id and event_kind='SIMPLE';
 if e.id is null then return sontu_private.fail('INVITATION_UNAVAILABLE'); end if;
 if action='configure' then
  if e.host_owner_user_id<>actor or enabled is null or e.lifecycle not in ('DRAFT','PUBLISHED','IN_PROGRESS') then return sontu_private.fail('UNAUTHORIZED'); end if;
  update sontu_private.event_instances set discussion_enabled=enabled,updated_at=now() where id=e.id;
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,gen_random_uuid(),actor::text,'EVENT_DISCUSSION_CONFIGURED',jsonb_build_object('enabled',enabled));
  return jsonb_build_object('status','ready','enabled',enabled);
 end if;
 if action='read' then
  if e.host_owner_user_id<>actor and not exists(select 1 from sontu_private.event_participants x where x.event_instance_id=e.id and x.participant_user_id=actor and x.commitment_state='CONFIRMED') then return sontu_private.fail('UNAUTHORIZED'); end if;
  return jsonb_build_object('status','ready','enabled',e.discussion_enabled,'items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'body',x.body,'created_at',x.created_at,'author_name',coalesce(nullif(ap.display_name,''),ap.first_name,split_part(u.email,'@',1)),'is_mine',x.author_user_id=actor,'state',x.state) order by x.created_at) from sontu_private.event_discussion_posts x join auth.users u on u.id=x.author_user_id left join sontu_private.account_profiles ap on ap.user_id=u.id where x.event_instance_id=e.id and (x.state='VISIBLE' or e.host_owner_user_id=actor)),'[]'::jsonb));
 end if;
 if action='post' then
  if not e.discussion_enabled or e.lifecycle not in ('PUBLISHED','IN_PROGRESS') or char_length(btrim(coalesce(body,''))) not between 1 and 1000 or not exists(select 1 from sontu_private.event_participants x where x.event_instance_id=e.id and x.participant_user_id=actor and x.commitment_state='CONFIRMED') then return sontu_private.fail('UNAUTHORIZED'); end if;
  insert into sontu_private.event_discussion_posts(event_instance_id,author_user_id,body) values(e.id,actor,btrim(body)) returning * into p;
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,gen_random_uuid(),actor::text,'EVENT_DISCUSSION_POSTED',jsonb_build_object('post_id',p.id));
  return jsonb_build_object('status','ready','id',p.id);
 end if;
 if action='hide' then
  if e.host_owner_user_id<>actor then return sontu_private.fail('UNAUTHORIZED'); end if;
  update sontu_private.event_discussion_posts set state='HIDDEN',moderated_at=now(),moderated_by=actor where id=post_id and event_instance_id=e.id returning * into p;
  if p.id is null then return sontu_private.fail('INVALID_INPUT'); end if;
  insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(e.id,gen_random_uuid(),actor::text,'EVENT_DISCUSSION_MODERATED',jsonb_build_object('post_id',p.id,'state','HIDDEN'));
  return jsonb_build_object('status','ready','id',p.id);
 end if;
 return sontu_private.fail('INVALID_INPUT');
end $$;

revoke all on function sontu_private.event_discussion(text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function sontu_private.event_discussion(text,uuid,uuid,text,boolean) to authenticated;
