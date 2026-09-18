# Sontu Local Beta Rollback And Disable Playbook

Status: LOCAL MIRROR / OPERATIONAL DRAFT
Last updated: 2026-09-16
Scope: Local Supabase prototype at `C:\Users\Jay\Documents\Projects\sontu`

This playbook is for bounded local beta testing. It gives a safe response path when a feature causes broken UI, bad data, or confusing user behavior. It does not replace production incident response.

## Rules

- Do not push to GitHub while using this local playbook unless Jay explicitly asks.
- Preserve the working tree. Do not use destructive Git commands.
- Query Dev Notes and telemetry before closing any user-reported bug.
- Prefer disabling the user-facing entry point before deleting data.
- Record the exact feature, route, user state, event id, and observed failure.
- Run `npm.cmd run check` after any code or migration change.

## Fast Disable Matrix

| Feature / surface | Local disable path | Data safety check | Re-enable check |
| --- | --- | --- | --- |
| Guest RSVP | Switch event RSVP access to `SONTU_USERS_ONLY` from Host Workspace; if UI is broken, use `sontu_event_participation_access`. | Confirm existing participants remain unchanged. | Signed-out event page shows account CTA; signed-in Going still works. |
| Private guest links | Revoke affected participant link from Host Workspace; if UI is broken, use `sontu_host_command('revoke_link', ...)`. | Confirm participant remains `CONFIRMED` unless RSVP removal was intended. | Reissue link creates a new token and old link fails. |
| Host RSVP removal | Hide/avoid the `Remove from Going` control until DB/RPC and telemetry are retested. | Confirm no participant was accidentally released. | Remove action writes participant/admission/audit/telemetry evidence. |
| Event cover upload | Use stock cover keys from the picture chooser. Avoid deleting uploaded storage objects during triage. | Confirm current `cover_key` and card/detail rendering. | Upload under 5 MB renders on Home, Discover, Events, public event, and host workspace. |
| Profile avatar upload | Use existing avatar or no-avatar fallback. Avoid deleting storage objects during triage. | Confirm `avatar_path` and fallback are circular. | Header, drawer, profile, public profile, host row, attendee row render correctly. |
| Event duplication | Do not use Duplicate; create a fresh draft manually. | Confirm no duplicate draft was created before retrying. | Duplicate creates one draft and opens `/create/:id` with copied fields. |
| Email dispatch | Treat local delivery as simulated unless the edge function returns delivery evidence. | Confirm outbox/communication rows do not imply user receipt. | UI says queued/config unavailable/sent honestly. |
| Check-in | Do not start event unless ready to test admissions. If already started, stop testing check-in and document state. | Confirm lifecycle and admission status before further RSVP tests. | Check-in admits valid credentials once and rejects duplicates/wrong event. |
| Dev Notes | If Supabase sync fails, keep local note behavior active. | Confirm local note remains after reload. | Signed-in note syncs to Supabase without breaking signed-out notes. |
| Telemetry | If telemetry insert fails, keep product action working and capture Dev Note/manual evidence. | Confirm no sensitive metadata was stored. | Attempted and terminal rows exist for critical flows. |

## Local Evidence Queries

Use Docker exec against `supabase_db_sontu` if `psql` is not on PATH.

```powershell
docker exec -i supabase_db_sontu psql -U postgres -d postgres -c "select created_at,screen,body from public.sontu_dev_notes order by created_at desc limit 20;"
docker exec -i supabase_db_sontu psql -U postgres -d postgres -c "select created_at,event_name,screen,metadata from public.sontu_beta_telemetry order by created_at desc limit 40;"
```

## Recovery Pattern

1. Capture the issue in Dev Notes or the work log.
2. Query telemetry and related DB state.
3. Disable the entry point or feature path using the matrix above.
4. Fix or revert only the smallest responsible local change.
5. Run `npm.cmd run check`.
6. Re-enable only after the specific scenario has DB and UI evidence.

## Do Not Use This Playbook For

- Production secrets or hosted environment changes.
- Payment/refund behavior.
- Deleting user data to make a test pass.
- Reverting unrelated local work.
