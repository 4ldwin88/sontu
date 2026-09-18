# Local Beta Test Runbook

This runbook separates automated evidence from human acceptance. Automated checks can establish that workflows execute and data rules hold; they do not prove that the phone experience feels correct.

## Local endpoints

- App on this computer: `http://localhost:5173`
- App on Jay's phone: `http://69.194.47.153:5173`
- Local email inbox: `http://localhost:55324`
- Local Supabase Studio: `http://localhost:55323`

The phone and computer must remain on the same local network. These addresses apply to the current network session and should be rechecked after a router or computer restart.

From `C:\Users\Jay\Documents\Projects\sontu`, start the current checkout with:

```powershell
npm.cmd run dev
```

Do not use an older hosted deployment for local beta acceptance.

## Automated evidence

Record a dated result for each line before calling a batch ready for human testing.

| Area | Automated check | AI validated | Human validated |
| --- | --- | --- | --- |
| Code health | Lint, type checking, 81 unit tests, and production build pass | Yes, 2026-09-17 | No |
| Database | Full migration history applies and all 42 database integration cases pass | Yes, 2026-09-17 | No |
| Event creation | Compact viewport creates, saves, recovers, publishes, edits, and cancels an event | Yes | No |
| Invitations | Compact viewport sends and accepts an invitation, handles a material change, reconfirms, and verifies revocation | Yes | No |
| Guest verification | Local email includes both a verification link and one-time code | Yes | No |
| Host workspace | Private operations, delivery, recipient, and team wrappers execute for signed-in hosts | Yes | No |
| Telemetry | Local event records are queryable without exposing note content as telemetry | Yes | No |

The compact browser regression currently contains 26 passing scenarios. This is AI validation only; it does not replace the phone checks below.

## Human phone test batch

Use the phone URL above. Submit one Dev Note per defect with the screen name, action attempted, visible result, and expected result.

1. Sign in with an existing local account. Confirm the avatar appears in the top-left menu button, open drawer, profile editor, View Profile, and public profile.
2. Upload a new avatar, save it, reload, sign out and back in, and confirm the same image remains in all five locations.
3. Create an event using an uploaded cover. Save a draft, leave the flow, resume it, complete schedule and location, preview, and publish.
4. Confirm the uploaded event cover appears on Home, Discover, Events, event detail, and host workspace. Change the cover after publishing and confirm every surface updates.
5. While signed out in a private browser, open the event. Confirm the choices are Sign in to RSVP and Continue as guest.
6. Continue as guest, enter guest details, retrieve the local email code or link from Mailpit, confirm the RSVP, and open the private guest RSVP page.
7. While signed in, confirm Going and Interested both work and that no redundant Go as guest action appears.
8. As host, open guest management. Reject or remove a participant and confirm the participant disappears from the Going list and counts update everywhere.
9. Revoke a guest management link and confirm the old link fails. Reissue it and confirm the replacement works while the old link stays invalid.
10. Make a material schedule change. Confirm participants are told to reconfirm and can complete reconfirmation.
11. Save a Dev Note while signed in, then sign out and save another. Confirm the signed-out note persists locally and telemetry remains available for both session types.
12. Check compact light appearance on Home, Events, event detail, host workspace, Connections, profile, account utilities, and every event-creation step. Watch for unreadable cards, off-screen actions, overlap, accidental dark styling, or square avatar placeholders.

## Acceptance rule

Mark Human validated only after the exact workflow succeeds on the phone. A passing automated test stays in the AI validated column and must not be promoted to human acceptance by inference.

The governing local acceptance boundary is recorded in [Sontu Local Beta Acceptance Contract](./beta-acceptance-contract.md).

## Latest human execution

The 2026-09-16 cross-device pass is recorded in [2026-09-16 Human Beta Test Results](./2026-09-16-human-beta-test-results.md).

| Area | Human result |
| --- | --- |
| Avatars and profile persistence | Passed on both phones; privacy boundaries passed |
| Draft creation, resume, upload, publish | Passed; mobile layout redesign required |
| Published cover replacement | Passed across desktop and both phones |
| Signed-in Going | Passed across sessions |
| Interested | Failed visible feedback/filter expectation despite telemetry save |
| Guest RSVP | Partial; creation passed, email/recovery failed |
| Host remove RSVP | Failed on both host surfaces |
| Revoke/reissue | Partial; revoke UI passed, reissued link failed to open |
| Material change | Partial; date propagated, reconfirmation failed |
| Cancellation | Partial; state propagated, participant history missing |
| Dev Notes | Passed signed in and signed out; signed-in list refresh lagged |
| Connections | Core accept/remove/follow passed; pending counts and discovery failed |
| Organizations | Blocked by mobile compatibility |
| Host operational modules | Mixed; discussion and assistant passed, several modules blocked by compatibility or permissions |
| Light theme and mobile layout | Failed visual acceptance |
