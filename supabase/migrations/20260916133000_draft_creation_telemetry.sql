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
      'create_draft_attempted',
      'create_draft_delayed',
      'create_draft_succeeded',
      'create_draft_failed',
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
      'event_interest_removed',
      'host_link_issue_attempted',
      'host_link_issue_succeeded',
      'host_link_issue_failed',
      'host_link_revoke_attempted',
      'host_link_revoke_succeeded',
      'host_link_revoke_failed',
      'host_rsvp_remove_attempted',
      'host_rsvp_remove_succeeded',
      'host_rsvp_remove_failed'
    )
  );
