# Sontu Beta QA Execution Checklist

Status: LOCAL MIRROR - Google Drive authority governs
Last reconciled: 2026-09-18
Drive authority: 02.01.08 Sontu Beta QA Execution Checklist
Drive authority URL: https://docs.google.com/document/d/1vnrBmE32QaIp-tk1h8_4bF_CuKUAQf-orHWyQRw0Euo/edit
Parent scope authority: 02.01.07 Sontu Beta/MVP Feature & Function Checklist
Parent scope authority URL: https://docs.google.com/document/d/1ksiigszNgZxJbV7TTGLAD7C4-dk2aYsSv76fTS-DTeM/edit

This file turns the beta/MVP feature checklist into an executable QA checklist. The feature checklist defines scope. This file defines what to do, what must happen, and what evidence is required before a row can be checked off.

## Latest Human Execution Summary

The full 2026-09-16 cross-device result is recorded in [2026-09-16 Human Beta Test Results](./2026-09-16-human-beta-test-results.md). This execution used signed-out desktop, two signed-in Samsung phones, and a third account for relationship verification.

Highest-priority blockers found:

1. Direct mobile `crypto.randomUUID()` usage blocks invitation responses, organizations, team changes, event start/check-in/complete, and related operational commands.
2. Missing execute privileges behind public security-invoker wrappers block RSVP forms, host questions, participant admission/communication projections, analytics, credentials, and seating.
3. Host RSVP removal fails despite four observed attempts and leaves participant counts unchanged.
4. Material changes do not create participant reconfirmation UI.
5. Mobile Home overflows horizontally; header/bottom navigation can fail to return; Light theme and multiple contrast states fail visual acceptance.

Do not rely on older `Not run` or `Partial` row text without checking the linked execution record. Row-level normalization should be completed after the systemic repairs and focused regression, so a failed result is not accidentally promoted by stale automated evidence.

## 2026-09-18 Drive Authority Reconciliation

The live Google Drive QA authority records a later live-environment pass that qualifies earlier local evidence:

- `https://sontu.cc` is live as the GitHub Pages custom domain. GitHub DNS check succeeded, the certificate was issued, and HTTPS enforcement was enabled. Normal and incognito browsing loaded without the prior certificate warning.
- Resend sending domain `sontu.cc` is verified, and a fresh account-confirmation email was received from the SONTU custom-domain sender path. The message arrived in Junk, so production deliverability remains unresolved and is not launch-ready evidence.
- Supabase Authentication Site URL was corrected from the former `sontu-design-preview` URL to `https://sontu.cc`. A recreated test user's confirmation link landed on `sontu.cc` with onboarding instead of the old preview domain.
- Receiving/inbound email was not tested and is not implied by the transactional-send test.
- Application-level live-site QA is paused because `sontu.cc` represented a stale GitHub Pages deployment relative to the active local source and local Supabase development state. Live QA results must record deployed commit/build identity and backend/migration identity before they are treated as current-product evidence.
- New blocking regression observed on the stale deployed release: signed-out event intent and return route were not preserved across authentication. This is recorded in QA-AUTH-03, but it must be retested against the current local candidate before being treated as a current local defect.

## Checkoff Rules

- Do not mark a scenario Passed unless the exact expected result is observed.
- If a scenario depends on mobile behavior, desktop-only evidence is not enough.
- If a scenario changes persisted state, include either a Supabase query, telemetry row, Dev Note record, or automated test evidence.
- If a scenario is fixed in code but not retested in the running local prototype, mark it Needs retest.
- If a scenario passes with a workaround or simulated provider, mark it Partial and name the simulation.
- If a failure is observed, add a Dev Note, record telemetry if available, and leave the checklist row Failed or Blocked.
- Revoke link, remove RSVP, withdrawal, cancellation, material change, and published edits are consequential actions. They need DB/audit evidence, not just UI confirmation.

## Required Evidence Codes

- DESKTOP: manual desktop browser pass.
- MOBILE: manual phone/WebView or narrow mobile viewport pass.
- DB: local Supabase query confirms persisted state.
- TEL: telemetry row confirms attempted and terminal result where applicable.
- DEVNOTE: latest Dev Notes checked; new note captured if issue found.
- TEST: automated unit/integration/browser test exists and passes.
- VISUAL: screenshot or direct visual inspection confirms layout/contrast.
- RLS: access-control check using host, participant, other signed-in user, and anon where applicable.

## Test Personas

| Persona ID | State | Purpose | Required setup |
| --- | --- | --- | --- |
| P-HOST | Signed in host | Create, publish, manage, invite, remove RSVP, change cover | Verified local account with profile image |
| P-PARTICIPANT | Signed in non-host | RSVP Going/Interested, withdraw, view connected event | Separate verified local account |
| P-GUEST | Signed out guest | Guest RSVP, private guest management link | No active account session |
| P-INVITED | Invited guest | Private invite response and link revoke/reissue | Event participant with invitation email |
| P-ORG-HOST | Signed in org admin/member | Organization-owned event behavior | Org account/context if implemented |
| P-OTHER | Signed in unrelated user | RLS/access leakage checks | Verified account not related to event |
| P-ANON | Signed out viewer | Public/unlisted/private page and CTA checks | No session |

## Required Fixtures

| Fixture ID | Purpose | Required properties |
| --- | --- | --- |
| E-DRAFT | Draft creation/resume | Draft event with partial fields and no publish |
| E-PUBLIC | Public event | Future published public event with uploaded cover |
| E-UNLISTED | Unlisted/private-link event | Future published unlisted event |
| E-PRIVATE | Private/account-restricted event | Future published restricted event |
| E-ONLINE | Protected virtual info | Online event with protected join info |
| E-PHYSICAL | Location/check-in/capacity | Physical event with venue and capacity |
| E-FULL | Capacity enforcement | Published event at capacity |
| E-EXPIRED | Expired visibility | Past event that should not appear in upcoming discovery |
| E-MATERIAL | Material-change flow | Published event with confirmed participant |
| E-CANCEL | Cancellation flow | Published event safe to cancel during test |

## Execution Checklist

### Identity, Account, And Return Routing

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-AUTH-01 | F01,F02 | Sign in and session restore | P-HOST | Signed out browser | Sign in, reload app, open Home, Events, Profile | Session persists; no white screen; profile/menu loads | DESKTOP,MOBILE,TEL | Partial - manual live-site pass 2026-09-18: session survived hard reload and navigation; TEL and remaining required device evidence pending; observed on deployed site, not current local candidate |
| QA-AUTH-02 | F01,F02 | Sign out clears account UI | P-HOST | Signed in | Open drawer/menu, sign out, reload | User is signed out; protected pages redirect or show auth CTA | DESKTOP,MOBILE,TEL | Partial - manual live-site pass 2026-09-18: sign-out cleared account UI and Profile requested sign-in/create-account; TEL and remaining required device evidence pending; observed on deployed site, not current local candidate |
| QA-AUTH-03 | F01,F34,F44 | Signed-out event RSVP auth return | P-ANON | Open E-PUBLIC direct link | Tap sign-in CTA, sign in as P-PARTICIPANT | User returns to same event and can RSVP | DESKTOP,MOBILE,TEL | Failed on stale deployed release - live-site manual test 2026-09-18: after choosing Going while signed out and signing in, user landed on Events > Upcoming instead of the originating event and RSVP was not applied. Retest against current local candidate before classifying as current local defect |
| QA-AUTH-04 | F33,F36 | Event-list return route | P-HOST | Open Events filter | Open event hub from Upcoming/Hosting/Interested, use back | User returns to same source filter, not wrong filter | DESKTOP,MOBILE,TEL | Not run |

### Profiles And Avatars

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-PROF-01 | F03 | Edit name/profile fields | P-HOST | Existing profile | Edit Name, bio, interests; save; reload | Values persist and render in profile | DESKTOP,DB,TEL | Not run |
| QA-PROF-02 | F03 | Upload avatar | P-HOST | Image file under 2 MB | Upload avatar, save, reload | Storage object exists; avatar_path saved; image renders | DESKTOP,MOBILE,DB,VISUAL | Not run |
| QA-PROF-03 | F03,F47 | Avatar surface matrix | P-HOST | Avatar uploaded | Check top-left button, open drawer, profile, public profile, event host row, attendee list | Image is circular and replaces placeholder everywhere | MOBILE,VISUAL | Not run |
| QA-PROF-04 | F03 | No-avatar fallback | P-PARTICIPANT | Remove/no avatar | Check same surfaces | Placeholder is circular, not square, and initials/icon are legible | MOBILE,VISUAL | Not run |

### Event Creation And Publishing

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-CREATE-01 | F09 | Draft creation starts | P-HOST | No active draft request | Open create flow and choose owner/category/format | Draft creates without stuck loading; retry message does not appear | DESKTOP,MOBILE,TEL,DB | Partial - source and schema coverage added for attempted/delayed/succeeded/failed draft-start telemetry; desktop/mobile live flow pending |
| QA-CREATE-02 | F09 | Retry draft creation recovers | P-HOST | Simulate/reproduce slow draft if possible | Trigger retry after draft timeout | Same operation recovers; no duplicate draft | DESKTOP,DB,TEL | Partial - retry copy and telemetry are guarded; browser/mobile timeout recovery pass pending |
| QA-CREATE-03 | F10 | Resume draft after reload | P-HOST | E-DRAFT exists | Reload /create/:id and continue editing | Existing fields and cover load; no duplicate | DESKTOP,MOBILE,DB | Not run |
| QA-CREATE-04 | F11,F12,F13,F14,F16 | Core field persistence | P-HOST | E-DRAFT | Set title, description, category, format, visibility, date/time, venue | Values persist after save/reload and render in review | DESKTOP,DB | Not run |
| QA-CREATE-05 | F25 | Readiness review catches missing fields | P-HOST | Incomplete draft | Try to publish or open review | Missing/important fields are visible without false readiness | DESKTOP,MOBILE,VISUAL | Not run |
| QA-CREATE-06 | F26 | Publish event | P-HOST | Complete draft | Publish | lifecycle becomes PUBLISHED; appears on relevant surfaces | DESKTOP,DB,TEL | Not run |

### Event Media

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-MEDIA-01 | F15 | Upload draft cover | P-HOST | Draft, image under 5 MB | Upload cover in create flow | Image stores in event media bucket and appears in draft preview | DESKTOP,MOBILE,DB,VISUAL | Not run |
| QA-MEDIA-02 | F15,F27 | Change published cover | P-HOST | E-PUBLIC with existing cover | Manage event, change picture after publish | New uploaded cover appears in host workspace and event detail | DESKTOP,MOBILE,DB,VISUAL | Not run |
| QA-MEDIA-03 | F15,F33,F36 | Cover propagation | P-HOST/P-ANON | E-PUBLIC with uploaded cover | Check Home, Discover, Events, public event, connected hub | Uploaded image appears; no stale stock image replaces it | DESKTOP,MOBILE,VISUAL | Not run |
| QA-MEDIA-04 | F15 | Stock/fallback behavior | P-HOST | Event with stock cover and event with no cover | Open cards/detail | Fallback is intentional, legible, and not confused with upload | DESKTOP,MOBILE,VISUAL | Not run |

### Discovery, Lists, And Event Detail

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-DISC-01 | F36 | Home featured cards | P-HOST/P-ANON | E-PUBLIC exists | Open Home | Cards show correct cover, title, date, location, chips, relationship | MOBILE,VISUAL | Not run |
| QA-DISC-02 | F36 | Discover future events only | P-ANON | E-PUBLIC and E-EXPIRED | Open Discover | Future public event appears; expired event does not appear as upcoming | DESKTOP,MOBILE,DB | Not run |
| QA-DISC-03 | F36,F44 | Events filters | P-PARTICIPANT | User has upcoming, hosting, invited, interested states | Open each Events filter | Each filter shows only matching events | DESKTOP,MOBILE,DB | Not run |
| QA-DISC-04 | F33,F34 | Public event direct link | P-ANON | E-PUBLIC | Open direct /event/:id | Page loads; correct CTAs and details render | DESKTOP,MOBILE,VISUAL | Not run |
| QA-DISC-05 | F33,F47 | Connected event hub | P-HOST/P-PARTICIPANT | User related to event | Open /my-events/:id | Details, cover, Going list, and relationship controls render | DESKTOP,MOBILE,DB | Not run |
| QA-DISC-06 | OPS-03 | Empty/loading/error states | Any | Empty or forced failure state | Open Home/Discover/Events under empty/error conditions | Clear empty/error state, no indefinite spinner | DESKTOP,MOBILE,VISUAL | Partial - Home/Discover/Events now use explicit SystemState loading/error/empty copy with retry wiring guarded by tests; forced browser/mobile visual pass pending |

### RSVP, Interest, Guest RSVP

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-RSVP-01 | F20,F44 | Signed-in Going | P-PARTICIPANT | E-PUBLIC, not host | Tap Going | Button responds; participant becomes CONFIRMED; counts/cards update | MOBILE,DB,TEL | Not run |
| QA-RSVP-02 | F46,F52 | Signed-in withdrawal | P-PARTICIPANT | Confirmed on E-PUBLIC | Tap Leave/withdraw | Participant releases place; counts and Events filters update | MOBILE,DB,TEL | Not run |
| QA-RSVP-03 | F44 | Interested toggle | P-PARTICIPANT | E-PUBLIC, not host | Toggle Interested on and off | Interest state persists; Interested filter updates | DESKTOP,MOBILE,DB,TEL | Not run |
| QA-RSVP-04 | F52 | Capacity full blocks RSVP | P-PARTICIPANT/P-GUEST | E-FULL | Try Going/guest RSVP | RSVP is blocked with clear copy; no extra confirmed participant | DESKTOP,MOBILE,DB,TEL | Not run |
| QA-GUEST-01 | F20,F35,F44 | Signed-out guest RSVP | P-GUEST | E-PUBLIC allows guest RSVP | Open event, choose guest RSVP, enter name/email, confirm | Button responds; guest participant/admission created | MOBILE,DB,TEL | Not run |
| QA-GUEST-02 | F35,F45 | Private guest RSVP link opens | P-GUEST | Guest RSVP exists | Open private guest link | Correct guest event state appears without signing in | DESKTOP,MOBILE,DB | Not run |
| QA-GUEST-03 | F46 | Guest withdrawal/rejoin | P-GUEST | Private guest link | Withdraw, then rejoin if allowed | Participant state changes correctly; capacity recovers | DESKTOP,MOBILE,DB,TEL | Partial - compact browser and DB pass; human mobile retest pending |
| QA-GUEST-04 | F20 | Signed-in users are not asked to RSVP as guest | P-PARTICIPANT | Signed in on event page | Inspect RSVP CTAs | Signed-in user sees Going/Interested, not guest-as-signed-in confusion | MOBILE,VISUAL | Not run |

### Host Workspace And Participant Management

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-HOST-01 | F27,F32 | Manage event entry points | P-HOST | E-PUBLIC | Enter from Home card, Events card, public page, connected hub | Host lands in correct host workspace, no confusing redirect | DESKTOP,MOBILE,TEL | Not run |
| QA-HOST-02 | F47,F48 | Attendee list visibility | P-HOST | Event with host, account participant, guest, hidden/name-only if supported | Open participants section | Host can identify going/pending/declined without privacy leakage | DESKTOP,MOBILE,DB,VISUAL | Not run |
| QA-HOST-03 | F47,F83 | Remove from Going | P-HOST | Confirmed participant exists | Click Remove from Going and confirm | Participant no longer counted as Going; admission/credential revoked; telemetry succeeds | MOBILE,DB,TEL | AI pass - compact browser and DB prove Manage Event removal, released participation, and invalid admission; human mobile retest pending |
| QA-HOST-04 | F35,F47 | Revoke private link | P-HOST | Invited/guest participant with link | Click Revoke private link | Link is revoked; participant remains Going if confirmed | DESKTOP,DB,TEL | Partial - DB/RPC rollback passed and telemetry event names/source guards passed 2026-09-16; UI click pending |
| QA-HOST-05 | F35,F47 | Reissue private link | P-HOST | Revoked or existing participant link | Click Reissue/Issue private link | New private link is generated; old revoked link cannot manage RSVP | DESKTOP,DB,TEL | Partial - DB/RPC rollback passed and telemetry event names/source guards passed 2026-09-16; UI click pending |
| QA-HOST-06 | F17,F20 | RSVP access mode | P-HOST | Event supports account/guest access mode | Toggle guest/account-only if available | Future RSVP choices follow selected access without corrupting existing participants | DESKTOP,MOBILE,DB | Not run |
| QA-HOST-07 | F32 | Host analytics counts | P-HOST | Event with mixed participant states | Open analytics/summary | Counts match DB participant/admission state | DESKTOP,DB | Not run |

### Event Changes, Cancellation, And Notifications

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-CHANGE-01 | F27,F28 | Non-material published edit | P-HOST | E-MATERIAL | Make cosmetic/non-material edit | Event updates without inappropriate reconfirmation obligation | DESKTOP,DB | Not run |
| QA-CHANGE-02 | F28,F75 | Material published edit | P-HOST | E-MATERIAL with confirmed participant | Change date/time/location materially | Material change/audit exists; participant obligation/notice state is clear | DESKTOP,DB,TEL | Not run |
| QA-CHANGE-03 | F28,F75 | Participant reconfirm/release | P-PARTICIPANT | Material change obligation exists | Open connected event and respond | Response state updates without falsely settling unrelated obligations | DESKTOP,MOBILE,DB | Not run |
| QA-CHANGE-04 | F30 | Cancel event | P-HOST | E-CANCEL | Cancel event through host workspace | lifecycle CANCELLED; event no longer accepts RSVP; cancellation visible | DESKTOP,MOBILE,DB,TEL | Not run |
| QA-CHANGE-05 | F31 | Complete/archive event | P-HOST | Past or completed fixture | Close/archive if supported | Closed event leaves upcoming but remains in history where appropriate | DESKTOP,DB | Not run |
| QA-CHANGE-06 | F74,F75,F76 | Communication state honesty | P-HOST/P-PARTICIPANT | Event with simulated or unavailable delivery | Inspect notices/history | UI does not claim real email delivery unless delivery evidence exists | DESKTOP,DB,VISUAL | Not run |

### Protected Virtual Info And Access

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-VIRT-01 | F81 | Protected join info hidden before RSVP | P-ANON/P-OTHER | E-ONLINE with protected info | Open event before RSVP | Join details are not exposed | DESKTOP,MOBILE,RLS | Partial - compact browser and DB pass; human mobile retest pending |
| QA-VIRT-02 | F81,F82 | Join info releases after allowed condition | P-PARTICIPANT | Confirmed RSVP on E-ONLINE | Open connected event at/after release condition | Join info appears only when allowed | DESKTOP,DB,RLS | Not run |
| QA-VIRT-03 | F83 | Revoked access loses join info | P-PARTICIPANT | RSVP removed or access revoked | Open connected/private link | Join info is unavailable after revocation | DESKTOP,DB,RLS | Partial - account withdrawal browser and DB pass; human retest pending |

### Dev Notes, Telemetry, And Observability

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-OPS-01 | OPS-01 | Signed-in Dev Note | P-HOST | Signed in | Submit Dev Note | Note writes to Supabase with user_id and screen | DESKTOP,MOBILE,DB | Not run |
| QA-OPS-02 | OPS-01 | Signed-out Dev Note | P-ANON | Signed out | Submit Dev Note, reload | Note persists locally/session and sync path is not broken | MOBILE,DB/LOCAL | Not run |
| QA-OPS-03 | OPS-02 | RSVP telemetry coverage | P-PARTICIPANT/P-GUEST | RSVP scenarios | Run RSVP attempts and outcomes | attempted and succeeded/failed rows exist where expected | DB,TEL | Not run |
| QA-OPS-04 | OPS-02 | Host action telemetry coverage | P-HOST | Host action scenarios | Remove RSVP, issue link, revoke link | host_* telemetry rows exist and include non-sensitive metadata | DB,TEL | Partial - schema accepts host action telemetry names and source guards attempted/succeeded/failed calls; live telemetry row query after UI actions pending |
| QA-OPS-05 | OPS-02 | Sensitive metadata filter | Any | Route with token/private link | Trigger route/telemetry | Telemetry metadata does not store email, token, invite/respond URL, password, or secret | DB | Not run |

### Mobile And UI Board QA

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-UI-01 | OPS-03 | Primary page mobile load | P-HOST/P-ANON | Phone/WebView | Open Home, Discover, Events, Create, Event, Host Workspace, Profile | No white screen; no unsupported syntax/CSS breakage | MOBILE,VISUAL | Not run |
| QA-UI-02 | OPS-03 | Default-theme contrast | Any | Default theme | Inspect public event, cards, About, Going, host panels | No white-on-white or unreadable low-contrast panels | MOBILE,VISUAL | Not run |
| QA-UI-03 | OPS-03 | Layout stability | Any | Narrow viewport | Inspect cards, bottom nav, dev-note tab, modals, participant rows | No overlaps, clipped buttons, hidden CTAs, or text overflow | MOBILE,VISUAL | Not run |
| QA-UI-04 | F33,F36 | UI board consistency | P-HOST/P-PARTICIPANT/P-ANON | Normal browsing | Review all primary pages | Screens follow board direction; no obvious legacy first screens remain | DESKTOP,MOBILE,VISUAL | Not run |

### Security, RLS, Storage, And Operations

| QA ID | Capability IDs | Scenario | Persona | Setup | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-SEC-01 | F03 | Profile media ownership | P-HOST/P-OTHER/P-ANON | Avatar uploaded | Try owner upload/update/delete and non-owner access attempts | Owner can manage own path; non-owner cannot overwrite/delete | DB,RLS | Partial - live local bucket/policy query plus rollback-only insert/update and negative owner/folder checks passed 2026-09-16; Storage API delete attempt pending |
| QA-SEC-02 | F15 | Event media ownership | P-HOST/P-OTHER/P-ANON | Event cover uploaded | Try host upload/change and non-host overwrite/delete | Host can manage; non-host cannot overwrite/delete | DB,RLS | Partial - live local bucket/policy query plus rollback-only insert/update and negative owner/folder checks passed 2026-09-16; Storage API delete attempt pending |
| QA-SEC-03 | F16,F17,F35 | Event visibility access matrix | P-HOST/P-PARTICIPANT/P-OTHER/P-ANON | Public, unlisted, private fixtures | Read/open each fixture as each persona | Exposure matches visibility/access rules | DESKTOP,DB,RLS | Partial - automated DB/RPC matrix passed 2026-09-16; desktop/mobile route pass pending |
| QA-SEC-04 | F28,F30,F83 | Consequential audit | P-HOST/P-PARTICIPANT | RSVP/remove/material/cancel actions | Run action and query audit/provenance tables | Action has operation id and reconstructable audit trail | DB | Not run |
| QA-SEC-05 | Venture readiness | Rollback/disable path | Local operator | Choose risky feature | Confirm documented disable/rollback procedure exists | Feature can be disabled or rolled back without guessing | DOC | Partial - local playbook drafted 2026-09-16; needs Drive authority review |

## Beta Gate Buckets

| Gate | Must pass before |
| --- | --- |
| Gate 1 - Local internal QA | QA-AUTH, QA-PROF, QA-CREATE, QA-MEDIA, QA-DISC, QA-RSVP, QA-GUEST, QA-HOST, QA-OPS, QA-UI |
| Gate 2 - Controlled external beta | Gate 1 plus QA-CHANGE, QA-VIRT, QA-SEC access/storage/audit rows, support/reporting/privacy basics |
| Gate 3 - MVP/public launch | Controlled external beta plus payment/admission/export/waitlist/notification production paths where activated |

## Current Known Regression Priority

1. Remove from Going must be retested on phone with DB and telemetry confirmation. DB/RPC rollback passed 2026-09-16.
2. Revoke private link must be confirmed as link-only, not attendance removal. DB/RPC rollback passed 2026-09-16.
3. Reissue private link must be tested after revoke. DB/RPC rollback passed 2026-09-16.
4. Draft creation stuck loading must be retested on mobile.
5. Signed-in Going and signed-out guest RSVP must be retested on phone.
6. Event cover upload must be checked across Home, Discover, Events, public event, connected hub, and host workspace.
7. Avatar placeholder/image must be checked in top-left menu button and opened drawer.
8. Mobile contrast and layout must be checked on event detail/About/Going panels.
9. Expired events must be checked against Home/Discover/Events upcoming surfaces.
10. Dev Notes and telemetry must be queried before closing any user-reported bug.
11. Rollback/disable playbook must be reviewed before controlled external beta.

## QA Run Log

| Date | QA IDs | Result | Evidence |
| --- | --- | --- | --- |
| 2026-09-17 | QA-PROF-01 | AI pass | Contact email, phone, and location save and reload through the compact account workflow; database coverage proves General, Close, and Only me field visibility. |
| 2026-09-17 | QA-HOST-03 | AI pass | Compact two-account browser pass: host removes the confirmed participant from Manage Event, participation becomes `RELEASED_DECLINED`, and admission is no longer valid. The participant-facing Event Hub has no duplicate removal control. |
| 2026-09-17 | QA-CHANGE-04 | AI pass | Compact two-account browser pass: cancellation creates an unread indicator, Notifications clears it when opened, and the cancelled event remains in participant History. |
| 2026-09-17 | QA-VIRT-01,QA-VIRT-02,QA-VIRT-03 | AI pass | Three-session compact browser pass covers hidden protected access, release after Going, participant question and accommodation workflows, host acknowledgement/reply, withdrawal, and access revocation. |
| 2026-09-16 | QA-HOST-03 | Partial | Rollback-only local Supabase RPC test passed: `sontu_host_participant_rsvp` returned ready, participant moved to `RELEASED_DECLINED`, admission became `REVOKED`, and `HOST_REMOVED_RSVP` audit entry was written. Mobile click and telemetry still pending. |
| 2026-09-16 | QA-HOST-04 | Partial | Rollback-only local Supabase host command test passed: `revoke_link` returned ready, participant remained `CONFIRMED`, admission stayed `VALID`, and link became revoked. UI click and telemetry still pending. |
| 2026-09-16 | QA-HOST-05 | Partial | Rollback-only local Supabase host command test passed: `issue_link` returned ready with token, link revoked state cleared, future expiry set, participant remained `CONFIRMED`, and admission stayed `VALID`. UI click and telemetry still pending. |
| 2026-09-17 | QA-GUEST-03 | Partial | Two-context compact browser pass: guest RSVP survived reload from the saved private credential, private management exposed withdrawal, participant state became `RELEASED_DECLINED`, admission became invalid, and a full event reopened to RSVP after withdrawal. Human mobile retest remains pending. |
| 2026-09-17 | QA-VIRT-01,QA-VIRT-03 | Partial | Three-session compact browser pass: host join-info save persisted; anonymous and signed-in nonparticipants saw only the protected placeholder; Going released the private details; public-participant withdrawal revoked them. Human cross-device retest remains pending. |
| 2026-09-16 | QA-SEC-05 | Partial | Local rollback/disable playbook created at `docs/implementation/local-beta-rollback-disable-playbook.md`; requires Drive authority review before external beta. |
| 2026-09-16 | QA-SEC-03 | Partial | Automated DB/RPC matrix passed: public events appear in discovery, unlisted events are direct-link only, private events stay out of public lookup, unrelated signed-in users cannot open private hubs, confirmed participants and hosts can. Desktop/mobile route pass pending. |
| 2026-09-16 | QA-SEC-01,QA-SEC-02 | Partial | Live local Supabase query confirmed `profile-media` and `event-media` buckets plus public-read and owner-folder insert/update/delete policies on `storage.objects`. Rollback-only SQL checks confirmed owner insert/update succeeds and wrong-owner/wrong-folder insert is blocked for both buckets. Direct SQL delete is blocked by Supabase Storage's protective trigger, so delete still needs a Storage API attempt. |
| 2026-09-16 | QA-CREATE-01,QA-CREATE-02 | Partial | Added draft-start telemetry for attempted, delayed, succeeded, and failed create-draft requests; migration applied locally and integration test accepts all four events. Mobile/desktop live create and timeout-retry pass still pending. |
| 2026-09-16 | QA-DISC-06 | Partial | Home, Discover, and Events now use explicit SystemState loading/error/empty states with retry wiring on load failures; source guard test added. Forced browser/mobile visual pass still pending. |
| 2026-09-16 | QA-OPS-04 | Partial | Integration test accepts host link issue/revoke and host RSVP remove telemetry event names; source guard confirms attempted/succeeded/failed calls remain in host workspace/event hub code. Live UI telemetry row query still pending. |
| 2026-09-18 | QA-AUTH-01 | Partial | Live `sontu.cc` manual test: confirmed account signed in successfully; session persisted through hard refresh and navigation to another page. Required telemetry and remaining device evidence still pending. Result belongs to deployed-site infrastructure evidence, not current local-candidate proof. |
| 2026-09-18 | QA-AUTH-02 | Partial | Live `sontu.cc` manual test: sign-out succeeded; site remained usable signed out; Profile correctly presented Sign in/Create Account. Required telemetry and remaining device evidence still pending. Result belongs to deployed-site infrastructure evidence, not current local-candidate proof. |
| 2026-09-18 | QA-AUTH-03 | Failed / stale deployment qualified | From a public event while signed out, Going presented guest RSVP or sign-in/create-account. After signing in, routing went to Events > Upcoming rather than back to the originating event and the RSVP was not added. This was observed on the stale deployed release and must be retested against the current local candidate. |

## 2026-09-18 Live Environment Qualification

The live-domain infrastructure checks are valid only for the environment pieces directly tested: GitHub Pages custom domain, HTTPS enforcement, Resend sending-domain verification, Supabase hosted Auth Site URL, and confirmation redirect to `https://sontu.cc`.

Application-level live-site QA is paused because `sontu.cc` represented a stale GitHub Pages deployment relative to the active local Git and local Supabase development state. Future live QA must record the deployed commit/build and backend/migration identity before results are treated as current-product evidence. Current local candidate behavior remains unverified until local runtime and browser/mobile checks run against the active checkout.
