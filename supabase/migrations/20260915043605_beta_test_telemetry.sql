-- Temporary beta telemetry for founder-guided testing.
-- This records safe interaction milestones, not raw clickstream, field values,
-- invite links, emails, tokens, full URLs, or accommodation/request text.
create table public.sontu_beta_telemetry (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  event_name text not null check (
    event_name in (
      'route_view',
      'dev_note_submit_attempted',
      'dev_note_submit_succeeded',
      'dev_note_submit_failed',
      'create_event_save_attempted',
      'create_event_save_succeeded',
      'create_event_save_failed',
      'create_event_publish_attempted',
      'create_event_publish_succeeded',
      'create_event_publish_failed',
      'rsvp_form_save_attempted',
      'rsvp_form_save_succeeded',
      'rsvp_form_save_failed',
      'public_event_response_attempted',
      'public_event_response_succeeded',
      'public_event_response_failed',
      'accommodation_request_attempted',
      'accommodation_request_succeeded',
      'accommodation_request_failed'
    )
  ),
  screen text not null check (
    screen in (
      'home',
      'discover',
      'events',
      'feed',
      'hosting',
      'invitation',
      'account',
      'profile',
      'other'
    )
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and length(metadata::text) <= 2000
    and metadata::text !~* E'([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|https?://|/invite/|/respond/|token|password|secret)'
  ),
  created_at timestamptz not null default now()
);

alter table public.sontu_beta_telemetry enable row level security;
revoke all on public.sontu_beta_telemetry from public, anon, authenticated;
grant insert on public.sontu_beta_telemetry to anon, authenticated;

create policy beta_telemetry_insert_anon
on public.sontu_beta_telemetry for insert
to anon
with check (user_id is null);

create policy beta_telemetry_insert_authenticated
on public.sontu_beta_telemetry for insert
to authenticated
with check ((select auth.uid()) = user_id);

create index sontu_beta_telemetry_time on public.sontu_beta_telemetry(created_at desc);
create index sontu_beta_telemetry_session_time on public.sontu_beta_telemetry(session_id, created_at desc);
create index sontu_beta_telemetry_user_time on public.sontu_beta_telemetry(user_id, created_at desc) where user_id is not null;
