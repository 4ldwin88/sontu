alter table public.sontu_dev_notes
  alter column user_id drop not null,
  add column if not exists session_id uuid;

alter table public.sontu_dev_notes
  drop constraint if exists sontu_dev_notes_identity_check;

alter table public.sontu_dev_notes
  add constraint sontu_dev_notes_identity_check
  check (
    (user_id is not null and session_id is null)
    or (user_id is null and session_id is not null)
  );

grant insert on public.sontu_dev_notes to anon;

create policy anonymous_notes_write
on public.sontu_dev_notes for insert
to anon
with check (user_id is null and session_id is not null);

create index if not exists sontu_dev_notes_session_time
on public.sontu_dev_notes(session_id, created_at desc)
where session_id is not null;

alter table public.sontu_beta_telemetry
  drop constraint if exists sontu_beta_telemetry_event_name_check;

alter table public.sontu_beta_telemetry
  add constraint sontu_beta_telemetry_event_name_check
  check (
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
      'accommodation_request_failed',
      'ui_board_variant_viewed',
      'home_priority_surface_viewed',
      'consumer_root_navigation_used',
      'event_feed_attention_item_viewed',
      'host_context_entry_viewed',
      'event_interest_saved',
      'event_interest_removed'
    )
  );
