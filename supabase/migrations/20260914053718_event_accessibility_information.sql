create table sontu_private.event_accessibility_information (
  event_instance_id uuid primary key references sontu_private.event_instances(id) on delete cascade,
  step_free_entry boolean not null default false,
  accessible_washroom boolean not null default false,
  seating_available boolean not null default false,
  quiet_space_available boolean not null default false,
  public_notes text not null default '' check (char_length(btrim(public_notes)) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
alter table sontu_private.event_accessibility_information enable row level security;

create function sontu_private.event_accessibility(action text,event_id uuid,token text default null,payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e sontu_private.event_instances; info sontu_private.event_accessibility_information; allowed boolean;
begin
  if action not in ('READ','SAVE') then return sontu_private.fail('INVALID_INPUT'); end if;
  select * into e from sontu_private.event_instances where id=event_accessibility.event_id and event_kind='SIMPLE';
  if not found then return sontu_private.fail('INVALID_INPUT'); end if;
  allowed:=actor=e.host_owner_user_id
    or (e.lifecycle<>'DRAFT' and e.visibility in ('PUBLIC','UNLISTED'))
    or exists(select 1 from sontu_private.event_participants p where p.event_instance_id=e.id and token is not null and p.token_hash=sha256(convert_to(token,'UTF8')) and p.token_revoked_at is null and p.token_expires_at>now());
  if not allowed then return sontu_private.fail('UNAUTHORIZED'); end if;
  if action='SAVE' then
    if actor is null or actor<>e.host_owner_user_id or payload is null or jsonb_typeof(payload)<>'object' or char_length(btrim(coalesce(payload->>'public_notes','')))>1000 then return sontu_private.fail('INVALID_INPUT'); end if;
    insert into sontu_private.event_accessibility_information(event_instance_id,step_free_entry,accessible_washroom,seating_available,quiet_space_available,public_notes,updated_at,updated_by)
    values(e.id,coalesce((payload->>'step_free_entry')::boolean,false),coalesce((payload->>'accessible_washroom')::boolean,false),coalesce((payload->>'seating_available')::boolean,false),coalesce((payload->>'quiet_space_available')::boolean,false),btrim(coalesce(payload->>'public_notes','')),now(),actor)
    on conflict(event_instance_id) do update set step_free_entry=excluded.step_free_entry,accessible_washroom=excluded.accessible_washroom,seating_available=excluded.seating_available,quiet_space_available=excluded.quiet_space_available,public_notes=excluded.public_notes,updated_at=now(),updated_by=actor;
  end if;
  select * into info from sontu_private.event_accessibility_information where event_instance_id=e.id;
  return jsonb_build_object('status','ready','information',case when info.event_instance_id is null then jsonb_build_object('step_free_entry',false,'accessible_washroom',false,'seating_available',false,'quiet_space_available',false,'public_notes','') else jsonb_build_object('step_free_entry',info.step_free_entry,'accessible_washroom',info.accessible_washroom,'seating_available',info.seating_available,'quiet_space_available',info.quiet_space_available,'public_notes',info.public_notes,'updated_at',info.updated_at) end);
end $$;

create function public.sontu_event_accessibility(action text,event_id uuid,token text default null,payload jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$ select sontu_private.event_accessibility(action,event_id,token,payload) $$;
revoke all on function sontu_private.event_accessibility(text,uuid,text,jsonb),public.sontu_event_accessibility(text,uuid,text,jsonb) from public;
grant execute on function public.sontu_event_accessibility(text,uuid,text,jsonb) to anon,authenticated;
