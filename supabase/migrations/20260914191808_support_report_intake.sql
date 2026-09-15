create table sontu_private.support_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  report_kind text not null check (report_kind in ('ACCOUNT_ACCESS','EVENT_PARTICIPATION','PRIVACY_ACCESS','FRAUD_IMPERSONATION','HARASSMENT_THREAT','ILLEGAL_CONTENT','SPAM_LINK','IP_COMPLAINT','SAFETY_CONCERN','PRODUCT_DEFECT')),
  body text not null check (char_length(body) between 1 and 1000),
  event_instance_id uuid references sontu_private.event_instances(id) on delete set null,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','IN_REVIEW','RESOLVED','CLOSED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status in ('RECEIVED','IN_REVIEW') and resolved_at is null) or (status in ('RESOLVED','CLOSED') and resolved_at is not null))
);
alter table sontu_private.support_reports enable row level security;
revoke all on sontu_private.support_reports from anon, authenticated;
create index support_reports_reporter_created on sontu_private.support_reports(reporter_user_id,created_at desc);

create function sontu_private.support_report(action text default 'read', input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); report sontu_private.support_reports; kind text; detail text; linked_event uuid;
begin
 if actor is null or not exists(select 1 from auth.users u where u.id=actor and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('status','denied'); end if;
 if action='read' then return jsonb_build_object('status','ready','reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'report_kind',r.report_kind,'status',r.status,'created_at',r.created_at) order by r.created_at desc) from sontu_private.support_reports r where r.reporter_user_id=actor),'[]'::jsonb)); end if;
 if action<>'create' then return jsonb_build_object('status','error','error_code','INVALID_ACTION'); end if;
 kind:=input->>'report_kind'; detail:=btrim(input->>'body');
 if kind is null or kind not in ('ACCOUNT_ACCESS','EVENT_PARTICIPATION','PRIVACY_ACCESS','FRAUD_IMPERSONATION','HARASSMENT_THREAT','ILLEGAL_CONTENT','SPAM_LINK','IP_COMPLAINT','SAFETY_CONCERN','PRODUCT_DEFECT') or detail is null or char_length(detail) not between 1 and 1000 then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
 begin linked_event:=nullif(input->>'event_instance_id','')::uuid; exception when invalid_text_representation then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end;
 if linked_event is not null and not exists(select 1 from sontu_private.event_instances where id=linked_event) then return jsonb_build_object('status','error','error_code','INVALID_INPUT'); end if;
 insert into sontu_private.support_reports(reporter_user_id,report_kind,body,event_instance_id) values(actor,kind,detail,linked_event) returning * into report;
 insert into sontu_private.audit_entries(event_instance_id,operation_id,actor_ref,audit_kind,metadata) values(linked_event,gen_random_uuid(),actor::text,'SUPPORT_REPORT_RECEIVED',jsonb_build_object('report_kind',kind));
 return jsonb_build_object('status','ready','report',jsonb_build_object('id',report.id,'report_kind',report.report_kind,'status',report.status,'created_at',report.created_at));
end $$;
revoke all on function sontu_private.support_report(text,jsonb) from public,anon,authenticated;
grant execute on function sontu_private.support_report(text,jsonb) to authenticated;
create function public.sontu_support_report(action text default 'read', input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.support_report(action,input) $$;
revoke all on function public.sontu_support_report(text,jsonb) from public,anon,authenticated;
grant execute on function public.sontu_support_report(text,jsonb) to authenticated;
