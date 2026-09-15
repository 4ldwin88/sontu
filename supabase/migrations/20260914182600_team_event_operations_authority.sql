-- Co-hosts and event managers can coordinate bounded event work. Door and
-- volunteer roles remain operationally narrow.
create or replace function sontu_private.event_operations_projection(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not sontu_private.can_manage_event_state(event_id,auth.uid()) then return sontu_private.fail('UNAUTHORIZED'); end if;
 return jsonb_build_object('status','ready',
  'todos',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'due_at',t.due_at,'state',t.state,'assignee_team_member_id',t.assignee_team_member_id) order by t.state desc,t.due_at nulls last,t.created_at) from sontu_private.event_todos t where t.event_instance_id=event_id),'[]'::jsonb),
  'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'quantity',r.quantity,'state',r.state,'note',r.note,'assignee_team_member_id',r.assignee_team_member_id) order by r.state desc,r.created_at) from sontu_private.event_resources r where r.event_instance_id=event_id),'[]'::jsonb));
end $$;

create or replace function sontu_private.event_operations_command(cmd text,event_id uuid,item_id uuid,operation_id uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fp text:=concat_ws('|',cmd,event_id,item_id,coalesce(input,'{}'::jsonb)::text); prior sontu_private.event_operations_requests; result jsonb;
begin
 if actor is null or not sontu_private.can_manage_event_state(event_id,actor) then return sontu_private.fail('UNAUTHORIZED'); end if;
 select * into prior from sontu_private.event_operations_requests r where r.operation_id=event_operations_command.operation_id;
 if found then if prior.actor_user_id<>actor or prior.fingerprint<>fp then return sontu_private.fail('IDEMPOTENCY_MISMATCH'); end if; return prior.result; end if;
 if cmd='add_todo' then insert into sontu_private.event_todos(event_instance_id,title,due_at) values(event_id,trim(input->>'title'),nullif(input->>'due_at','')::timestamptz) returning jsonb_build_object('status','ready','item_id',id) into result;
 elsif cmd='set_todo_state' then update sontu_private.event_todos set state=input->>'state',updated_at=now() where id=item_id and event_instance_id=event_id; if not found then return sontu_private.fail('INVALID_INPUT'); end if; result:=jsonb_build_object('status','ready','item_id',item_id);
 elsif cmd='add_resource' then insert into sontu_private.event_resources(event_instance_id,label,quantity,note) values(event_id,trim(input->>'label'),coalesce((input->>'quantity')::integer,1),nullif(trim(input->>'note'),'')) returning jsonb_build_object('status','ready','item_id',id) into result;
 elsif cmd='set_resource_state' then update sontu_private.event_resources set state=input->>'state',updated_at=now() where id=item_id and event_instance_id=event_id; if not found then return sontu_private.fail('INVALID_INPUT'); end if; result:=jsonb_build_object('status','ready','item_id',item_id);
 else return sontu_private.fail('INVALID_INPUT'); end if;
 insert into sontu_private.event_operations_requests(operation_id,actor_user_id,event_instance_id,fingerprint,result) values(operation_id,actor,event_id,fp,result); return result;
exception when check_violation or invalid_text_representation or not_null_violation then return sontu_private.fail('INVALID_INPUT');
end $$;
revoke all on function sontu_private.event_operations_projection(uuid),sontu_private.event_operations_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
