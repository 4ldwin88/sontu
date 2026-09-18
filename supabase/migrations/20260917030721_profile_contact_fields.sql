alter table sontu_private.account_profiles
  add column if not exists contact_email text not null default '',
  add column if not exists contact_email_visibility text not null default 'ONLY_ME'
    check (contact_email_visibility in ('GENERAL','CLOSE','ONLY_ME')),
  add column if not exists phone_number text not null default '',
  add column if not exists phone_visibility text not null default 'ONLY_ME'
    check (phone_visibility in ('GENERAL','CLOSE','ONLY_ME')),
  add column if not exists profile_location text not null default '',
  add column if not exists location_visibility text not null default 'GENERAL'
    check (location_visibility in ('GENERAL','CLOSE','ONLY_ME'));

alter function sontu_private.account_profile(text,jsonb)
  rename to account_profile_before_contacts;

create function sontu_private.account_profile(action text, input jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
  profile_row sontu_private.account_profiles;
  email_value text;
  phone_value text;
  location_value text;
  email_visibility text;
  phone_visibility_value text;
  location_visibility_value text;
begin
  if action = 'update' then
    select * into profile_row
      from sontu_private.account_profiles
      where user_id = actor;
    if profile_row.user_id is null then
      return jsonb_build_object('status','empty');
    end if;

    email_value := lower(btrim(coalesce(input->>'contact_email', profile_row.contact_email)));
    phone_value := btrim(coalesce(input->>'phone_number', profile_row.phone_number));
    location_value := btrim(coalesce(input->>'profile_location', profile_row.profile_location));
    email_visibility := upper(btrim(coalesce(input->>'contact_email_visibility', profile_row.contact_email_visibility)));
    phone_visibility_value := upper(btrim(coalesce(input->>'phone_visibility', profile_row.phone_visibility)));
    location_visibility_value := upper(btrim(coalesce(input->>'location_visibility', profile_row.location_visibility)));

    if char_length(email_value) > 254
      or (email_value <> '' and email_value !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
      return jsonb_build_object('status','error','error_code','INVALID_CONTACT_EMAIL');
    end if;
    if char_length(phone_value) > 40 then
      return jsonb_build_object('status','error','error_code','INVALID_PHONE');
    end if;
    if char_length(location_value) > 120 then
      return jsonb_build_object('status','error','error_code','INVALID_LOCATION');
    end if;
    if email_visibility not in ('GENERAL','CLOSE','ONLY_ME')
      or phone_visibility_value not in ('GENERAL','CLOSE','ONLY_ME')
      or location_visibility_value not in ('GENERAL','CLOSE','ONLY_ME') then
      return jsonb_build_object('status','error','error_code','INVALID_VISIBILITY');
    end if;
  end if;

  result := sontu_private.account_profile_before_contacts(action,input);
  if result->>'status' <> 'ready' or action <> 'update' then
    return result;
  end if;

  update sontu_private.account_profiles
  set contact_email = email_value,
      contact_email_visibility = email_visibility,
      phone_number = phone_value,
      phone_visibility = phone_visibility_value,
      profile_location = location_value,
      location_visibility = location_visibility_value
  where user_id = actor
  returning * into profile_row;

  return jsonb_set(result,'{profile}',to_jsonb(profile_row),true);
end
$$;

alter function sontu_private.public_profile_hub(text)
  rename to public_profile_hub_before_contacts;

create function sontu_private.public_profile_hub(handle_input text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  profile_row sontu_private.account_profiles;
  fields jsonb;
  owner_viewer boolean;
  close_viewer boolean;
begin
  result := sontu_private.public_profile_hub_before_contacts(handle_input);
  if result->>'status' <> 'ready' then return result; end if;

  select * into profile_row
    from sontu_private.account_profiles
    where handle = lower(btrim(coalesce(handle_input,'')));
  owner_viewer := coalesce((result#>>'{viewer,owner}')::boolean,false);
  close_viewer := coalesce((result#>>'{viewer,close}')::boolean,false);
  fields := coalesce(result#>'{profile,fields}','{}'::jsonb);

  if profile_row.contact_email <> '' and (
    profile_row.contact_email_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.contact_email_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object('email',profile_row.contact_email);
  end if;
  if profile_row.phone_number <> '' and (
    profile_row.phone_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.phone_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object('phone',profile_row.phone_number);
  end if;
  if profile_row.profile_location <> '' and (
    profile_row.location_visibility = 'GENERAL'
    or owner_viewer
    or (profile_row.location_visibility = 'CLOSE' and close_viewer)
  ) then
    fields := fields || jsonb_build_object('location',profile_row.profile_location);
  end if;

  return jsonb_set(result,'{profile,fields}',fields,true);
end
$$;

create or replace function public.sontu_account_profile(action text default 'read', input jsonb default '{}')
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.account_profile(action,input) $$;

create or replace function public.sontu_public_profile_hub(handle text)
returns jsonb language sql security invoker set search_path=''
as $$ select sontu_private.public_profile_hub(handle) $$;

revoke all on function
  sontu_private.account_profile_before_contacts(text,jsonb),
  sontu_private.account_profile(text,jsonb),
  sontu_private.public_profile_hub_before_contacts(text),
  sontu_private.public_profile_hub(text),
  public.sontu_account_profile(text,jsonb),
  public.sontu_public_profile_hub(text)
from public,anon,authenticated;

grant execute on function sontu_private.account_profile(text,jsonb),public.sontu_account_profile(text,jsonb) to authenticated;
grant execute on function sontu_private.public_profile_hub(text),public.sontu_public_profile_hub(text) to anon,authenticated;
