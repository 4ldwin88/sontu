-- Support account-centric participant lookups as the public RSVP path grows.
create index event_participants_participant_user_idx
  on sontu_private.event_participants(participant_user_id)
  where participant_user_id is not null;
