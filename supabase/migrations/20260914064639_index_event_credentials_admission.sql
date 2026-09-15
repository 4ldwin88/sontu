-- Supports admission invalidation and credential revocation joins without
-- exposing credentials to browser clients.
create index event_credentials_admission_idx
  on sontu_private.event_credentials(admission_id);
