-- Public security-invoker wrappers execute these private security-definer
-- functions as the caller. Mirror each wrapper's exposed roles so the wrapper
-- can reach its implementation; row and command authorization remains inside
-- the private function.

grant execute on function sontu_private.check_in_credential_command(uuid,uuid,uuid) to authenticated;
grant execute on function sontu_private.event_host_questions(text,uuid,uuid,text) to authenticated;
grant execute on function sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer) to authenticated;
grant execute on function sontu_private.host_credential_lifecycle_projection(uuid) to authenticated;
grant execute on function sontu_private.host_operational_analytics(uuid) to authenticated;
grant execute on function sontu_private.host_participant_rsvp(uuid,uuid,text,uuid) to authenticated;
grant execute on function sontu_private.invitation_email_delivery(text,uuid,text,text,text,text,text) to authenticated;
grant execute on function sontu_private.request_event_delivery(uuid) to authenticated;
grant execute on function sontu_private.rsvp_party_allowance(uuid,uuid,integer) to authenticated;
grant execute on function sontu_private.rsvp_response_summary(uuid) to authenticated;

grant execute on function sontu_private.event_accommodations(text,uuid,uuid,uuid) to anon,authenticated;
grant execute on function sontu_private.participant_accommodation(text,uuid,text,text) to anon,authenticated;
grant execute on function sontu_private.participant_admission_projection(uuid,uuid) to anon,authenticated;
grant execute on function sontu_private.participant_communication_history(uuid,uuid) to anon,authenticated;
grant execute on function sontu_private.participant_seating(uuid,text) to anon,authenticated;
grant execute on function sontu_private.rsvp_form(text,uuid,text,jsonb,uuid) to anon,authenticated;
