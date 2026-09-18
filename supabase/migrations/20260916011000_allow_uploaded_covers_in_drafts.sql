create or replace function sontu_private.valid_draft(input jsonb) returns boolean
language sql stable set search_path='' as $$
 select jsonb_typeof(input)='object'
 and length(coalesce(input->>'title',''))<=120 and length(coalesce(input->>'description',''))<=2000
 and length(coalesce(input->>'venue_label',''))<=300
 and (
  coalesce(input->>'cover_key','') in ('food','music','market','yoga','sailing','sunset','none')
  or coalesce(input->>'cover_key','') ~ '^upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[-_.a-zA-Z0-9]+[.](jpg|jpeg|png|gif|webp)$'
 )
 and exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timezone')
 and (nullif(input->>'capacity','') is null or (
  input->>'capacity' ~ '^[0-9]+$'
  and (input->>'capacity')::numeric between 1 and 2147483647
 ))
 and (nullif(input->>'starts_at','') is null or isfinite((input->>'starts_at')::timestamptz))
 and (nullif(input->>'ends_at','') is null or isfinite((input->>'ends_at')::timestamptz))
 and (nullif(input->>'starts_at','') is null or nullif(input->>'ends_at','') is null or (input->>'starts_at')::timestamptz<(input->>'ends_at')::timestamptz)
$$;

revoke all on function sontu_private.valid_draft(jsonb) from public,anon,authenticated;
