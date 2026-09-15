-- Trigger entry points are database internals, never RPC commands. Explicitly
-- remove inherited execute privileges while leaving trigger invocation intact.
revoke all on function sontu_private.normalize_communication_simulation() from public,anon,authenticated;
revoke all on function sontu_private.queue_event_cancellation_messages() from public,anon,authenticated;
revoke all on function sontu_private.queue_guest_rsvp_confirmation() from public,anon,authenticated;
