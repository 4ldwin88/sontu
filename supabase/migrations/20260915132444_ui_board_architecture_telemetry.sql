alter table public.sontu_beta_telemetry
  drop constraint if exists sontu_beta_telemetry_event_name_check;

alter table public.sontu_beta_telemetry
  add constraint sontu_beta_telemetry_event_name_check check (
    event_name = any (array[
      'route_view'::text,
      'dev_note_submit_attempted'::text,
      'dev_note_submit_succeeded'::text,
      'dev_note_submit_failed'::text,
      'create_event_save_attempted'::text,
      'create_event_save_succeeded'::text,
      'create_event_save_failed'::text,
      'create_event_publish_attempted'::text,
      'create_event_publish_succeeded'::text,
      'create_event_publish_failed'::text,
      'rsvp_form_save_attempted'::text,
      'rsvp_form_save_succeeded'::text,
      'rsvp_form_save_failed'::text,
      'public_event_response_attempted'::text,
      'public_event_response_succeeded'::text,
      'public_event_response_failed'::text,
      'accommodation_request_attempted'::text,
      'accommodation_request_succeeded'::text,
      'accommodation_request_failed'::text,
      'ui_board_variant_viewed'::text,
      'home_priority_surface_viewed'::text,
      'consumer_root_navigation_used'::text,
      'event_feed_attention_item_viewed'::text,
      'host_context_entry_viewed'::text
    ])
  );
