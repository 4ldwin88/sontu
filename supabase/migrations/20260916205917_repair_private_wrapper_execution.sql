-- Public security-invoker wrappers still need permission to call their
-- private implementations. The private schema is not exposed by PostgREST,
-- and each function performs its own event-authority checks.
grant execute on function sontu_private.event_operations_projection(uuid),
  sontu_private.event_operations_command(text,uuid,uuid,uuid,jsonb),
  sontu_private.event_delivery_projection(uuid),
  sontu_private.event_delivery_recipients(uuid),
  sontu_private.event_team_hub_action(uuid)
to authenticated;
