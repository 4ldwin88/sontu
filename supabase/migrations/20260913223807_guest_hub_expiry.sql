-- The public event page may remain visible, but the accountless guest's
-- personal reservation view stops working when its event-scoped credential
-- expires or is revoked.
create function sontu_private.guest_hub_access(event_id uuid, manage_token uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare p sontu_private.event_participants;
begin
  select * into p
  from sontu_private.event_participants
  where event_instance_id=guest_hub_access.event_id
    and token_hash=sha256(convert_to(guest_hub_access.manage_token::text,'UTF8'));
  if p.id is null or p.token_revoked_at is not null or p.token_expires_at<=now() then
    return sontu_private.fail('GUEST_ACCESS_EXPIRED');
  end if;
  return sontu_private.guest_event_participation(event_id,'READ',null,null,null,null,manage_token);
end $$;

create function public.sontu_guest_hub_access(event_id uuid, manage_token uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.guest_hub_access(event_id,manage_token) $$;
revoke all on function sontu_private.guest_hub_access(uuid,uuid),public.sontu_guest_hub_access(uuid,uuid) from public;
grant execute on function public.sontu_guest_hub_access(uuid,uuid) to anon,authenticated;
