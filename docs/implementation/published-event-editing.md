# Published schedule and location slice

Extends the existing event command with `change_schedule` for SIMPLE published events. Hosts edit start, end and location, review previous/current values and explicitly save. Event timezone, title, cover and capacity remain preserved. Description-only editing remains the existing no-case control. No new tables, accounts, roles or external services.

Authority: Domain & System Behavior's material-version, explicit confirmation, stale-conflict, proportionality, and cosmetic/no-case rules. Schedule/location changes are recorded as material facts; they only suggest reconfirmation when current commitments exist. A host accepts or dismisses the suggestion. Existing accepted reconfirmation responsibility carries forward through the established successor-case path. A material edit alone does not manufacture a resolved or newly accepted case.

The review retains the version from opening the editor. Execution checks owner authority, expected version, PUBLISHED/SIMPLE state, explicit confirmation, future finite ordered dates, a nonempty bounded location and an actual change. Idempotency and atomic history/material provenance use the existing command contract. Lost responses retain the same operation for retry; stale submissions require reopening against current details.

Participant views show start/end/location and use event-details wording for reconfirmation. History preserves previous locations and durations. Email is still unconnected: the review explicitly says saving does not email guests or establish availability.

Validation: database coverage for unauthorized/invalid/stale/cancelled requests, retry identity, immutable history, zero-participant no-case behavior, venue-change suggestion, accepted obligation succession on end-time change and cosmetic no-case control. Browser coverage exercises review/save through Hosting, updated Event Hub, and recipient reconfirmation against the new venue/end time across compact/medium/wide widths. Accessibility checks run on the review dialog.
