# Sontu Physical Event Offline Fallback Plan

Status: LOCAL OPERATIONAL DRAFT
Last updated: 2026-09-16
Scope: Controlled local/beta physical-event testing

This plan defines what a host/operator should do if Sontu, Supabase, phone data, or check-in tooling is unavailable during a physical event test. It is intentionally simple and does not introduce a new product promise.

## Principles

- Do not deny a real attendee solely because the prototype cannot load.
- Do not mark attendance or payment state as verified unless it was actually verified.
- Preserve enough paper/manual evidence to reconcile later.
- Keep private information minimal: name, email or last four characters of credential reference, and action taken.
- Reconcile in Sontu after connectivity returns; do not silently rewrite uncertain attendance.

## Before The Event

- Export the participant CSV from Host Workspace.
- Save or print a copy of the event title, date/time, venue, host contact, and expected attendee list.
- If using credentials/check-in, prepare a manual check-in sheet with:
  - attendee name
  - email or credential reference fragment
  - arrival time
  - operator initials
  - notes
- Confirm at least one operator knows the host can still manage the event later from Host Workspace.

## During An Outage

1. Switch to the manual check-in sheet.
2. Search by name first, then email or credential reference if volunteered.
3. Record one of:
   - `admitted-manual`
   - `not-found-manual`
   - `duplicate-uncertain`
   - `needs-host-review`
4. Do not promise that Sontu has updated yet.
5. If a person is not on the list but the host chooses to admit them, record the host approval and reason.

## After Connectivity Returns

- Open Host Workspace and check event lifecycle, participant list, and check-in analytics.
- Enter or reconcile only actions that are supported by the current local tooling.
- Use Dev Notes for any mismatch between paper/manual records and Sontu state.
- Keep the paper/manual sheet until the event result is reconciled.

## Known Local Prototype Limits

- Offline mode is not implemented in-app.
- Manual check-in reconciliation is not yet a dedicated product workflow.
- Payment/refund state must not be inferred from a paper list.
- Production privacy/retention policy still needs authority review before external physical beta.
