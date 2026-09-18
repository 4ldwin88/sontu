# Sontu Beta/MVP Feature & Function Checklist

Status: LOCAL MIRROR - Google Drive authority governs
Last reconciled: 2026-09-16
Drive authority: 02.01.07 Sontu Beta/MVP Feature & Function Checklist
Drive authority URL: https://docs.google.com/document/d/1ksiigszNgZxJbV7TTGLAD7C4-dk2aYsSv76fTS-DTeM/edit

This file is the local implementation mirror for the beta/MVP checklist. The Google Drive document governs, and this file should be updated from that authority before implementation work. This mirror exists so local prototype work can stay aligned without repeatedly searching Drive.

## Source Authorities

- 02.01.03 Sontu Validation & Product Roadmap
  - Google Doc: https://docs.google.com/document/d/119OmLKc7hRtvotVgae32tSb-KaBhO14PmK5oHQYjSt4/edit
  - Governs lifecycle gates, beta/MVP readiness, validation evidence, and external rollout posture.
- 02.01.05 Sontu Functions & Capability Inventory
  - Google Doc: https://docs.google.com/document/d/1pFCfst7F0YSn2qLvKoqTUNRsuYkTjMhBCGgbhhZvy8g/edit
  - Governs feature/function staging by capability ID and disposition.
- SONTU Venture Development Checklist
  - Google Sheet: https://docs.google.com/spreadsheets/d/18-krP0GShoRJCj5ooJOKW2pRdKWhpBldtXHHN_5jUxA/edit
  - Governs venture readiness, launch controls, validation gates, and cross-functional hardening.
- Local prototype evidence
  - Supabase migrations, app code, Dev Notes, telemetry, and local tests are implementation evidence only. They do not override Drive authority.
- 02.01.08 Sontu Beta QA Execution Checklist
  - Google Doc: https://docs.google.com/document/d/1vnrBmE32QaIp-tk1h8_4bF_CuKUAQf-orHWyQRw0Euo/edit
  - Governs the detailed executable pass/fail checklist derived from this scope map.

## Reconciliation Rules

- Drive authority controls target scope. Local status tracks observed implementation and test evidence.
- A feature is not beta-ready just because code exists. It needs an end-to-end local test path, telemetry/Dev Notes where relevant, and tolerable mobile behavior.
- A feature is not MVP-ready until it satisfies the relevant external-use, security, privacy, support, and operational requirements from the Venture Development Checklist.
- Dev Notes and telemetry are required evidence for flows that users can exercise in the prototype.
- Account and non-account behavior must be tracked separately where both are supported.
- Use "Needs verification" when code may exist but the current behavior has not been recently tested.

## Status Vocabulary

- Implemented: built locally and recently verified.
- Partial: meaningful implementation exists, but coverage, UX, edge cases, or authority alignment is incomplete.
- Needs verification: implementation likely exists, but current behavior needs retest against the live local prototype.
- Not started: no meaningful local implementation confirmed.
- Deferred: intentionally outside the current beta slice.
- Blocked/External: depends on provider, production infrastructure, policy, or missing connector/tooling.

## Working Internal Beta / Closed Alpha Checklist

| ID | Capability / function | Drive disposition | Beta scope | Local prototype status | AI validated | Human validated | Evidence / notes | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | Account creation and sign-in | Working Beta | Users can create/sign in/out and maintain sessions. | Partial | Partially validated by AI/local evidence | Pending human validation | Local auth has worked, but email/confirmation behavior has been a recurring test constraint. | Re-test signed-in and signed-out flows before each RSVP slice. |
| F02 | Account recovery/logout/session | Working Beta | Basic session lifecycle is reliable. | Partial | Partially validated by AI/local evidence | Pending human validation | Sign-out paths now emit attempted/succeeded/failed telemetry and source coverage guards the controls. | Run signed-in reload/sign-out mobile and desktop pass. |
| F03 | Basic profile/identity | Working Beta | Name, profile details, and profile image appear consistently. | Implemented | Validated by AI/local evidence | User confirmed current fix | Profile image upload and menu/drawer/profile display were fixed locally. | Keep mobile avatar regression test. |
| F04 | Personal vs organization acting context | Working Beta | Events can be associated with correct owner context. | Implemented | Validated by AI/local evidence | User confirmed organization creation/ownership; identity retest pending | Organization-owned Event Hubs now expose the organization identity. | Include identity in grouped cross-device regression. |
| F05 | Organization identity/events | Working Beta | Basic organization-hosted events can exist. | Implemented | Validated by AI/local evidence | User confirmed org event creation; Event Hub identity retest pending | Organization creation, persistence, ownership, and hub identity are implemented. | Confirm organization name on host and participant hubs. |
| F06 | Basic organization membership/admin | Working Beta | Small admin/member model works at beta depth. | Implemented | Validated by AI/local evidence | User confirmed successor acceptance; repaired membership continuity needs retest | Accepting a successor now creates active member continuity without transferring ownership; focused browser flow passes. | Confirm accepted successor appears as a member and team candidate. |
| F09 | Draft creation | Working Beta | Host can start a draft without getting stuck. | Partial | Partially validated by AI/local evidence | Pending human validation | Browser coverage exercises signed-in creation, save timeout recovery, and publish path; draft-start attempted/delayed/succeeded/failed telemetry was added; mobile manual pass still needed because this was a prior reported issue. | Regression test draft creation on phone and desktop together. |
| F10 | Resume/edit draft | Working Beta | Host can return to an unfinished draft. | Partial | Partially validated by AI/local evidence | Pending human validation | Browser coverage reloads and reopens the draft URL, verifies entered fields, and continues to publish. | Confirm same recovery path on mobile WebView. |
| F11 | Title/description/category | Working Beta | Host can set core event identity. | Implemented | Validated by AI/local evidence | Pending human validation | Event creation/editing uses these fields. | Confirm validation and empty states. |
| F12 | Physical/virtual/hybrid format | Working Beta | Event format is represented and shown correctly. | Partial | Partially validated by AI/local evidence | Pending human validation | Physical/online display exists; hybrid needs retest. | Test all format variants. |
| F13 | Date/time/timezone | Working Beta | Event times are stored and shown consistently. | Partial | Partially validated by AI/local evidence | Pending human validation | Date format settings explicitly deferred; timezone handling remains beta requirement. | Keep timezone verification before external beta. |
| F14 | Physical location/protected virtual info | Working Beta | Location and virtual info can be represented safely. | Partial | Partially validated by AI/local evidence | Pending human validation | Public pages show location/online state; protected virtual info needs dedicated verification. | Test protected join-info release behavior. |
| F15 | Event cover image/media | Working Beta at practical launch depth | Host can upload cover image and change it after publishing. | Implemented | Validated by AI/local evidence | Pending human validation | Local cover upload/edit-after-publish was added after user Dev Notes. | Re-test cards, event detail, and stock fallback behavior. |
| F16 | Public/unlisted/private visibility | Working Beta | Visibility modes control discovery/access. | Partial | Partially validated by AI/local evidence | Pending human validation | Public and access-mode chips exist; deeper mode testing needed. | Test each visibility mode end to end. |
| F17 | Access/invite controls | Working Beta | Invitations and access gates work at beta depth. | Partial | Partially validated by AI/local evidence | Pending human validation | Guest private RSVP link exists for local testing; email delivery is deferred; changing RSVP access now blocks future guest joins without breaking existing guest management links. | Add real email link delivery later. |
| F18 | Capacity | Working Beta | Capacity limits are enforced. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms full-event blocking and recovered capacity after withdrawal; this overlaps F52 sold-out enforcement. | Run browser/mobile sold-out state pass. |
| F20 | Free RSVP/registration model config | Working Beta | Free RSVP flow is reliable. | Partial | Partially validated by AI/local evidence | Pending human validation | Guest RSVP success was seen; signed-in RSVP needed mobile UUID fix. | Re-test account RSVP and guest RSVP on phone. |
| F25 | Readiness/review before publish | Working Beta | Host gets sufficient pre-publish confidence. | Partial | Partially validated by AI/local evidence | Pending human validation | Draft blockers, preview dialog, accessibility scan, and publish button gating are covered in browser/domain tests. | Decide if beta needs a richer host-facing readiness checklist. |
| F26 | Publish event | Working Beta | Draft can become published. | Implemented | Validated by AI/local evidence | Pending human validation | Publish path exists and has been exercised locally. | Regression test after draft fixes. |
| F27 | Published event management/editing | Working Beta | Host can manage published event details. | Partial | Partially validated by AI/local evidence | Pending human validation | Host workspace and manage views exist; cover image post-publish now included. | Consolidate host management surfaces. |
| F28 | Material-change flow | Working Beta | Material edits are governed and auditable. | Implemented | Validated by AI/local evidence | User confirmed missing notice before repair; retest pending | Regular attendees stay Going while the latest old/new schedule appears in their Event Hub and creates a durable unread notification. Reconfirmation remains available for consequential roles. | Confirm notification, crossed-out prior time, and unchanged Going state. |
| F30 | Cancel event | Working Beta | Host can cancel event responsibly. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms cancellation changes lifecycle, invalidates admissions, preserves unresolved consequences, and audits the cancel action; connected hub copy now distinguishes cancelled/completed/in-progress states. | Run mobile/browser host cancellation pass and participant-facing cancelled-state pass. |
| F31 | Complete/archive record | Working Beta | Event lifecycle can close cleanly. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms closeout blocks open todos, is retry-safe, completes lifecycle, and preserves attendance snapshot. | Run host UI closeout/results pass. |
| F32 | Host event status/readiness summary | Working Beta essential depth | Host can see practical readiness and participant state. | Partial | Partially validated by AI/local evidence | Pending human validation | Host workspace exists; user noted missing attendee list and host controls. | Reconcile Host Workspace, Event Hub, and My Events. |
| F33 | Public event page | Working Beta | Event page works on mobile and desktop. | Partial | Partially validated by AI/local evidence | Pending human validation | UI board styling improved, but mobile contrast/layout regressions occurred. | Maintain mobile visual regression checklist. |
| F34 | Direct shareable link | Working Beta | Public event link opens reliably. | Implemented | Validated by AI/local evidence | Pending human validation | Shared links are used during local testing. | Verify signed-in/signed-out variants. |
| F35 | Private/unlisted invitation/access link | Working Beta | Private access link supports restricted flows. | Partial | Partially validated by AI/local evidence | Pending human validation | Local guest private link works; real email confirmation/link delivery deferred. | Build production email path later. |
| F36 | Basic public browse/discovery | Working Beta to acquisition/findability depth | Users can browse featured/upcoming events. | Partial | Partially validated by AI/local evidence | Pending human validation | Home/discovery cards exist; card layout had mobile issues. | Re-test filters and card management actions. |
| F40 | Attribution | Working Beta measurement where privacy appropriate | Acquisition/source can be measured. | Partial | Partially validated by AI/local evidence | Pending human validation | Route telemetry now captures whitelisted attribution query params and tests confirm sensitive values are filtered. | Verify real telemetry rows from a tagged local link. |
| F41 | Host-owned direct invitations | Working Beta | Host can invite directly at basic depth. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms direct invite creation, duplicate-email protection, email verification checks, invite acceptance, revoke behavior, and capacity conflict. | Run host UI invite/revoke/reissue pass and participant link pass. |
| F44 | RSVP/free registration | Working Beta | Participant can commit to going. | Partial | Partially validated by AI/local evidence | Pending human validation | Account RSVP and guest RSVP were actively debugged. | Confirm no frozen buttons on mobile. |
| F45 | Confirmation/participant relationship | Working Beta | RSVP creates durable participant relationship. | Partial | Partially validated by AI/local evidence | Pending human validation | Guest management links and participant records exist. | Verify confirmation copy and private management route. |
| F46 | Participant withdrawal/cancellation | Working Beta | Participant can cancel/release spot. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms account and guest withdrawal change participant state, update host analytics, invalidate admissions/credentials, and release capacity. | Verify withdrawal UI pass on phone. |
| F47 | Host participant list | Working Beta | Host can see attendees/participants. | Partial | Partially validated by AI/local evidence | Pending human validation | Host list exists; user noted Event Hub missing attendee list. | Decide canonical attendee-list surface. |
| F48 | Basic participant info | Working Beta | Host has enough info to operate event. | Partial | Partially validated by AI/local evidence | Pending human validation | Guest RSVP captures basic details. | Confirm fields and privacy display rules. |
| F52 | Capacity/sold-out enforcement | Working Beta; MVP host alerts | Capacity blocks/reopens correctly. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms CAPACITY_FULL on account/public joins and direct invite acceptance, plus capacity reopening after withdrawal with host analytics remaining consistent. | Test host removal/rejection impact and user-facing sold-out states. |
| F64 | Optional simple free-event check-in | Working Beta when useful | Basic check-in exists if needed for beta scenario. | Deferred | Not applicable yet | Pending human validation | No current evidence that beta scenario requires it immediately. | Revisit when testing physical events. |
| F74 | Essential announcements/updates | Working Beta | Host can communicate essential updates. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms participant communication history for event changes, guest RSVP confirmations, privacy boundaries, and notification preference suppression behavior. | Verify host-facing announcement/update workflow and delivery simulation UI. |
| F75 | Material-change/cancellation notices | Working Beta | Participants receive important change/cancel notices. | Partial | Partially validated by AI/local evidence | Pending human validation | Governance exists; real delivery likely incomplete locally. | Wire production notification path later. |
| F76 | Reminders/milestone notifications | Working Beta essential; MVP practical | Reminder behavior exists at minimum beta depth. | Deferred | Not applicable yet | Pending human validation | Not central to current local slice. | Define beta reminder minimum. |
| F80 | Event discussion / Ask Host assistant | Working Beta bounded depth | Event support/question path exists in bounded form. | Partial | Partially validated by AI/local evidence | Pending human validation | DB coverage confirms private Ask Host questions, host answers, unauthorized close protection, discussion enablement, participant posting, and host moderation/hide. | Verify event-page UI entry points and mobile behavior. |
| F81 | Protected virtual join info | Working Beta | Join info is protected until appropriate. | Partial | Partially validated by AI/local evidence | Pending human validation | Added standalone protected join-info RPC, host management UI, event-page read wiring, and DB coverage for host/account/guest access boundaries. | Run mobile/browser acceptance for host edit, account RSVP view, and guest private-link view. |
| F82 | Release timing for protected join info | Working Beta | Join details release at governed time. | Partial | Partially validated by AI/local evidence | Pending human validation | Current release is RSVP-confirmed access; test confirms non-RSVP viewers see no protected info and confirmed account/guest viewers can read it. | Decide later whether beta needs scheduled release timing beyond RSVP-confirmed access. |
| F83 | Changed/revoked virtual access | Working Beta | Access can be revoked/changed. | Partial | Partially validated by AI/local evidence | Pending human validation | Host RSVP removal revokes active admissions/credentials and removes the participant from the Going list while preserving revoked-link semantics separately. | Verify user-facing access update. |
| OPS-01 | Dev Notes for account and non-account users | Required local prototype evidence | Notes save locally without account and sync when signed in. | Implemented | Validated by AI/local evidence | Pending human validation | Prior fixes confirmed non-account local save and Supabase sync. | Keep checking notes when user reports issues. |
| OPS-02 | Telemetry for critical flows | Required local prototype evidence | RSVP, guest RSVP, interest, host actions, and errors are observable. | Partial | Partially validated by AI/local evidence | Pending human validation | Telemetry now covers draft-start attempted/delayed/succeeded/failed, RSVP, guest RSVP, interest, host link issue/revoke, host RSVP removal, and errors; browser/mobile live telemetry review remains required. | Add telemetry before risky client-side branches. |
| OPS-03 | Mobile compatibility | Required beta quality gate | Phone WebView/mobile browser must not white-screen or hide critical UI. | Partial | Partially validated by AI/local evidence | Pending human validation | Mobile CSS regressions occurred and were fixed. | Avoid risky syntax/CSS; verify on narrow viewport. |

## Working MVP Checklist

| ID | Capability / function | Drive disposition | MVP scope | Local prototype status | AI validated | Human validated | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F07 | Practical small-org roles/member management | Working MVP | Real org roles/admin behavior for launch cohort. | Needs verification | Not validated | Pending human validation | Audit current org model and define launch-depth roles. |
| F22 | Basic event customization/org branding | Working MVP | Hosts/orgs can customize enough to feel credible. | Partial | Partially validated by AI/local evidence | Pending human validation | Keep after beta event basics are stable. |
| F23 | Duplicate/copy event | Working MVP | Hosts can repeat event setup efficiently. | Partial | Partially validated by AI/local evidence | Pending human validation | Host Workspace can create a copied draft from an existing simple event and route the host into the draft editor; payload shaping is covered by a unit test. | Verify browser flow and decide whether copy should reset schedule by default. |
| F29 | Reschedule/postpone | Working MVP; beta if scenario requires | Hosts can reschedule/postpone with participant notice/reconfirmation where material. | Partial | Partially validated by AI/local evidence | Pending human validation | Browser and DB coverage exercise schedule/location review, confirmation, material-change governance, and reconfirmation behavior. Verify participant-facing notice/read state in mobile QA. |
| F37 | Search/filter/category/location/time discovery | Working MVP | Discovery is usable beyond basic browse. | Partial | Partially validated by AI/local evidence | Pending human validation | Improve after public browse beta path is stable. |
| F42 | Saved invite/audience lists | Working MVP candidate | Hosts can reuse audiences. | Deferred | Not applicable yet | Pending human validation | Validate demand first. |
| F43 | Follow-up invites | Working MVP candidate | Hosts can follow up without manual workarounds. | Deferred | Not applicable yet | Pending human validation | Validate demand first. |
| F49 | Configurable registration questions | Working MVP limited | Hosts can collect limited extra info. | Partial | Partially validated by AI/local evidence | Pending human validation | RSVP form manager supports limited short-text and single-select questions, participant answers, and host response summary; database coverage added for configuration, token response save, and summary. | Verify browser/mobile form configuration and participant answer flow. |
| F50 | Guest/plus-one representation | Working MVP candidate | Hosts can account for plus-ones. | Deferred | Not applicable yet | Pending human validation | Validate event types that require this. |
| F51 | Waitlist | Working MVP candidate | Capacity recovery can use waitlists. | Deferred | Not applicable yet | Pending human validation | Build after capacity enforcement is proven. |
| F53 | Participant export/report | Working MVP | Hosts can export participant records. | Partial | Partially validated by AI/local evidence | Pending human validation | Host Workspace participant CSV export is implemented locally from the host projection and covered by a domain CSV formatting test. | Verify browser download from the participants section and reconcile export fields against privacy rules. |
| F55 | Paid admission purchase | Prototype + staged Beta; MVP before paid external | Paid entry works before paid events leave controlled testing. | Deferred | Not applicable yet | Pending human validation | Keep disabled until payment scope is deliberately opened. |
| F56 | Basic admission/ticket classes | Working MVP | Paid/free classes supported where needed. | Deferred | Not applicable yet | Pending human validation | Pair with paid admission design. |
| F57 | Order/payment result/history | Working MVP | Payment and order state is trustworthy. | Deferred | Not applicable yet | Pending human validation | Pair with payment provider integration. |
| F58 | Digital/verifiable credential | Working MVP paid events | Paid/event credential is verifiable. | Deferred | Not applicable yet | Pending human validation | Implement with check-in/admission slice. |
| F59 | Refund path | Working MVP before paid external | Refunds are operationally safe. | Deferred | Not applicable yet | Pending human validation | Required before paid public use. |
| F65 | QR credential scan | Working MVP | Admission can be scanned. | Deferred | Not applicable yet | Pending human validation | Build when physical admission scenario needs it. |
| F66 | Manual lookup | Working MVP | Operators can find attendees manually. | Deferred | Not applicable yet | Pending human validation | Pair with check-in tooling. |
| F67 | Duplicate-use detection | Working MVP | Credentials cannot be reused unnoticed. | Deferred | Not applicable yet | Pending human validation | Pair with QR/check-in. |
| F68 | Check-in audit | Working MVP | Admission actions are auditable. | Deferred | Not applicable yet | Pending human validation | Pair with check-in tooling. |
| F69 | Multiple operator devices | Working MVP if required | Multiple staff can check in safely. | Deferred | Not applicable yet | Pending human validation | Only build if launch scenario requires it. |
| F72 | Offline/degraded fallback | Tested strategy before external physical testing | Physical events have fallback plan. | Partial | Partially validated by AI/local evidence | Pending human validation | Local physical-event offline fallback plan drafted for manual check-in and reconciliation. | Review before any external physical beta and decide whether manual reconciliation needs product UI. |
| F77 | Notification preferences/channels | Working MVP | Users can control notification channels. | Partial | Partially validated by AI/local evidence | Pending human validation | Account event email preference exists in setup/profile/settings and suppresses pending account event email; database coverage added for opt-out suppression. | Verify settings UI and define future channel granularity beyond event email. |
| F78 | Add-to-calendar/export | Working MVP candidate | Participants can save event to calendar. | Partial | Partially validated by AI/local evidence | Pending human validation | Calendar export generation is centralized and covered for escaping, fallback one-hour duration, URL, and filename behavior. | Verify browser download on mobile and desktop. |
| F79 | Host calendar integration | Post-MVP unless evidence demands | Host calendar sync. | Deferred | Not applicable yet | Pending human validation | Do not build for beta unless evidence changes. |

## Venture / Launch Readiness Checklist

| Area | Drive checklist status | Local mirror status | Required before |
| --- | --- | --- | --- |
| Beta product implementation | IN PROGRESS | Partial | Closed alpha / internal beta |
| Authenticated end-to-end verification | IN PROGRESS | Partial | Closed alpha |
| Security/authorization verification | IN PROGRESS | Partial | Controlled external beta |
| Data inventory/retention | IN PROGRESS | Needs verification | Controlled external beta |
| Support/reporting/moderation baseline | IN PROGRESS | Partial | Controlled external beta |
| Incident process | IN PROGRESS | Needs authority review | Controlled external beta |
| Privacy request path | IN PROGRESS | Needs authority review | Controlled external beta |
| Backup/recovery/environment separation | IN PROGRESS | Needs verification | Controlled external beta |
| Business continuity/ownership | IN PROGRESS | Needs authority review | Controlled external beta |
| Release/rollback/feature-disable | IN PROGRESS | Needs verification | Controlled external beta |
| Supported browser/device/accessibility | IN PROGRESS | Partial | Controlled external beta |
| External beta cohort/execution-validation plan | IN PROGRESS | Needs authority review | Controlled external beta |
| Production monitoring/error alerting | IN PROGRESS | Not local-only | Controlled external beta |
| Production secrets/environment controls | IN PROGRESS | Not local-only | Production launch |
| External capability activation matrix | IN PROGRESS | Needs creation/update | Controlled external beta |
| Initial geography/jurisdiction | IN PROGRESS | Needs authority review | Controlled external beta |
| Distribution/acquisition path | IN PROGRESS | Needs authority review | Controlled external beta |
| Vietnam Controlled Partner Beta readiness gate | IN PROGRESS | Scenario-gated | Vietnam partner beta |

## Beta Acceptance Matrix

This matrix breaks the beta scope into testable surfaces. Every beta slice should update the relevant rows from observed behavior, not from intention. Required evidence can include a passing automated test, direct local Supabase query, Dev Note/telemetry review, mobile screenshot, desktop screenshot, or manual scenario result.

### Identity & Account

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sign-in gate | Sign in, sign up, sign out, session restore | Signed out, signed in, expired session | User can enter and leave account state without losing intended return route. | Desktop + mobile auth route test; telemetry route sequence; Dev Notes review. | Needs verification | Not validated | Pending human validation |
| Return routing | `next` and `return` query handling | Signed out user joining event, signed-in user opening connected event | User returns to the event or list view they came from after auth or event hub exit. | Manual route test from Home, Discover, Events filters, public event, connected event. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Account menu | Top-left profile button and drawer | Signed in with avatar, signed in without avatar | Avatar, initials fallback, drawer state, and sign-out actions render consistently. | Mobile visual check; profile data query if broken. | Implemented, needs regression | Validated by AI/local evidence | Pending human validation |
| Utility pages | Profile, privacy, help, settings-style pages | Signed in, signed out redirect | Utility pages hide main nav and preserve drawer/back behavior. | Mobile and desktop navigation check. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Profiles & Avatars

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Profile editor | Name, bio, interests, avatar upload | Signed in account | Fields save, image previews, upload persists, and profile refreshes. | Supabase profile row + storage object query; mobile upload test. | Implemented | Validated by AI/local evidence | Pending human validation |
| Avatar rendering | Header, drawer, profile, public profile, event host, attendee list | Avatar exists, no avatar | Circular image renders where expected; placeholder is circular and replaced after upload. | Mobile screenshot matrix across surfaces. | Implemented, needs regression | Validated by AI/local evidence | Pending human validation |
| Public profile | `/p/:handle` and `@handle` | Viewer signed in/out | Public fields and avatar render without exposing private data. | Manual public profile test signed in/out. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Event Creation

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Draft start | First create screen | Signed in host | Draft creation does not hang; retry recovers same request. | Telemetry for draft attempt/success/failure; mobile create test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Draft resume | `/create/:eventId` | Host returning to draft | Existing fields and cover load; no duplicate draft is created. | Manual reload/resume test; DB draft count query. | Needs verification | Not validated | Pending human validation |
| Core fields | Title, description, category, format, visibility, date/time, venue | Host editing draft | Required validation is clear and saved values persist. | Form validation test; DB version query. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Readiness review | Pre-publish review/summary | Host before publish | Host sees missing/important fields before publish. | Manual create-to-review test. | Needs verification | Not validated | Pending human validation |
| Publish | Publish action | Host with ready draft | Draft becomes published and appears in the correct surfaces. | DB lifecycle query; Home/Discover/Events cards. | Implemented, needs regression | Validated by AI/local evidence | Pending human validation |

### Event Media

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cover upload | Draft cover uploader | Host editing draft | Uploaded image stores in Supabase and appears in draft preview. | Storage object query; mobile upload test. | Implemented | Validated by AI/local evidence | Pending human validation |
| Published cover edit | Host management cover change | Host editing published event | Cover can be changed after publishing and updates cards/detail pages. | Home, Discover, Events, public event, connected hub screenshot check. | Implemented, needs regression | Validated by AI/local evidence | Pending human validation |
| Fallback image | Event cards/detail cover fallback | No cover, stock cover, uploaded cover | No stale stock image appears after upload; fallback is legible. | Visual check across cards and detail. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Discovery & Event Lists

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home featured | Featured for you, upcoming, hosted event prompt | Signed in, signed out | Cards use correct cover, chips, relationship, and management action. | Mobile visual check; route click test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Discover | Browse/search/nearby mode | Signed in, signed out | Future public events appear; expired events stay hidden; filters do not mislabel relationship. | DB event query + Discover check. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Events filters | Upcoming, Hosting, Invited, Interested | Signed in account | Each filter shows only matching events and preserves selected filter after navigation. | Manual filter route test; telemetry route sequence. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Empty/loading/error states | Home, Discover, Events | No data, loading, RPC failure | User sees clear state and retry where appropriate. | Forced failure or mocked test. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Event Detail / Event Hub

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public event page | `/event/:id` | Signed out, signed in non-host, signed in host | Correct CTA appears: sign in/guest RSVP, Going/Interested, Manage event. | Manual account-state matrix. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Connected event hub | `/my-events/:id` | Host, confirmed participant, invited participant | Host/participant state, cover, details, Going list, discussion/questions render correctly. | Manual route test; event hub RPC query. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Back/share controls | Back button, share button | Entered from Home, Discover, Events filters, direct link | Back returns to the source route when known; share copies or invokes native share. | Manual mobile/desktop route test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Going list | Host, visible participants, hidden/name-only participants | Host, participant, public viewer | Privacy rules respected; host sees actionable participants where allowed. | RPC projection query; mobile visual check. | Partial | Partially validated by AI/local evidence | Pending human validation |

### RSVP & Interest

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Signed-in Going | Going button | Signed in non-host | Button responds on mobile, creates confirmed participant, updates count/card state. | Telemetry attempt/success; DB participant query; phone test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Signed-in withdrawal | Leave event | Confirmed participant | Participant releases place; count and My Events update. | DB participant/admission/credential query; telemetry. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Interested | Interested button and Events filter | Signed in non-host | Button toggles interest and event appears/disappears in Interested filter. | Telemetry saved/removed; Events filter test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Capacity handling | Full event state | Signed in, signed out guest | Full events block RSVP and reopen after withdrawal/removal. | Capacity scenario test; DB count query. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Guest RSVP

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Guest form | Name/email modal | Signed out guest | Confirm RSVP button works on mobile; creates guest participant and admission. | Telemetry guest attempt/success; DB query; phone test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Private guest link | Local private management link | Guest with token | Link opens same RSVP state and supports withdrawal/rejoin where allowed. | Manual link open test; token projection query. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Guest recovery | Already RSVP'd link | Guest who knows email | Local test message remains neutral; later email function will deliver link. | Manual recovery request; telemetry. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Account vs guest copy | CTA labels | Signed out, signed in | Signed-out users see sign-in or guest choices; signed-in users are not asked to RSVP as guest. | Visual account-state check. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Host Workspace & Participant Management

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Host workspace entry | Manage event links | Host from cards, public page, connected hub | Host lands on the correct management surface without confusing redirects. | Route test from all host entry points. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Attendee list | Participants tab / Going list | Host with none, one, many participants | Host can easily find who is going, pending, declined, or hidden. | Mobile visual check; projection query. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Remove RSVP | Remove RSVP action | Host removing confirmed participant | RSVP is released, admissions/credentials revoked, telemetry records result. | DB query after action; telemetry host_rsvp_remove_succeeded. | Partial | Partially validated by AI/local evidence | Pending human validation |
| RSVP access mode | Guest RSVP allowed vs account-only | Host changing access | Future RSVP rules update without corrupting existing participants. | Manual toggle test; DB projection query. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Host analytics | Operational analytics panel | Host | Counts match participant/admission state. | RPC query + UI comparison. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Event Changes & Notifications

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Published edits | Host edits published event | Host, participant | Material changes are tracked and participant obligations are clear. | Audit entries query; connected hub notice check. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Reconfirmation | Material-change prompt | Host, affected participant | Host can require/release reconfirmation without implying false confirmation. | DB obligation query; participant view. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Cancellation | Cancel event | Host, participant, public viewer | Event closes to new participation and cancellation state is visible. | Lifecycle query; public/connected page check. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Communication history | Participant notices | Participant/guest | Notices show sent/pending/unavailable state without claiming delivery falsely. | Communication RPC query. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Dev Notes & Telemetry

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dev Notes save | Floating Dev Note tool | Signed in, signed out | Notes persist locally without account and sync to Supabase when available. | Dev note DB query; local reload test. | Implemented | Validated by AI/local evidence | Pending human validation |
| Dev Notes coverage | Bug-reporting during flows | Any tester | Notes capture route/screen context without leaking sensitive tokens. | DB sanitization query; manual note test. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Telemetry coverage | Critical attempts/success/failure | Draft creation, account RSVP, guest RSVP, interest, host remove, route views | Each risky user action records attempted and terminal result where possible. | Telemetry query after scenario. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Evidence review loop | Before claiming fixed | Any reported bug | Latest Dev Notes and telemetry are checked before final status. | Query log in work notes/final. | Process requirement | Process required | Pending human validation |

### Mobile / UI Board QA

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mobile load | Home, Discover, Events, create, event hub, host workspace | Phone browser/WebView | No white screen; no unsupported syntax/CSS regression. | Phone test or mobile viewport screenshot. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Contrast/readability | Cards, panels, buttons, badges | Default theme | Text is readable; no white-on-white or low-contrast panels. | Visual QA screenshots. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Layout stability | Cards, bottom nav, dev-note tab, modals | Narrow viewport | No overlaps, clipped buttons, or text overflow. | Mobile screenshot matrix. | Partial | Partially validated by AI/local evidence | Pending human validation |
| UI board consistency | All primary pages | Signed in normal use | Pages follow the designed board direction rather than old generic layouts. | Page-by-page visual pass. | Partial | Partially validated by AI/local evidence | Pending human validation |

### Security, RLS, Storage & Operations

| Subcategory | Surface / component | User states | Expected behavior | Evidence required | Current status | AI validated | Human validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Profile media storage | Avatar bucket/path policies | Owner, other user, anon | Users can manage only their own avatar paths. | Storage policy inspection; upload/update/delete test. | Partial | Validated by AI/local evidence | Pending human validation |
| Event media storage | Event cover bucket/path policies | Host, non-host, anon | Hosts can manage own event covers; non-hosts cannot overwrite. | Storage policy inspection; upload/update/delete test. | Partial | Validated by AI/local evidence | Pending human validation |
| Event access RLS/functions | Public/private/unlisted, participant-only, host-only | Host, participant, other signed-in user, anon | Data exposure matches visibility/access rules. | RPC matrix query using test users. | Partial | Validated by AI/local evidence | Pending human validation |
| Auditability | RSVP, host removal, material change, cancellation | Host/participant actions | Consequential actions write audit entries with operation ids. | Audit table query after scenario. | Partial | Partially validated by AI/local evidence | Pending human validation |
| Rollback/disable path | Feature flags/config/manual rollback | Local/prod future | Risky features can be disabled or rolled back. | Documented procedure. | Needs authority review | Pending | Pending human validation |

## Current Local Prototype Reconciliation Notes

- Profile pictures are implemented locally and should appear in profile, public profile, top-left menu button, and opened drawer.
- Event cover upload and post-publish cover changes are implemented locally, but should be retested across Home cards, event detail, and management pages because the user observed stock-photo fallback behavior before fixes.
- RSVP has account and guest paths. Guest RSVP uses a local private management link for testing; production email confirmation/link delivery is intentionally deferred.
- Signed-in users should primarily see Going and Interested actions. Guest RSVP should be for signed-out users.
- Host RSVP removal is implemented and human-validated across host and participant sessions; removal updates the Going list and participant state.
- Host participant CSV export is implemented locally in the Host Workspace participants section. It exports host-visible participant rows from the loaded projection; browser download and privacy-field review still need verification.
- Duplicate/copy event is implemented locally from the Host Workspace for simple events. It creates a new draft using the current event version and opens the draft editor; browser flow still needs verification.
- Configurable RSVP questions are implemented and human-validated end to end: host configuration persists, participants can answer, and submitted responses appear in the host workspace.
- Offline/degraded fallback now has a local operational draft at `docs/implementation/physical-event-offline-fallback-plan.md`; it is a strategy document, not in-app offline support.
- Notification preferences exist at event-email depth. Account users can opt out of event emails, and pending account event-email outbox rows are suppressed before delivery; broader channel preferences remain future scope.
- Event cards now carry source-route return context into event hubs so a user opening from an Events filter can return to that same filter.
- Host event hubs now expose an explicit attendee-list path, and Host Workspace supports opening directly to the participants section with `?section=participants`.
- Dev Notes and telemetry are part of the product validation loop, not optional debug conveniences. When the user reports a failed flow, check both before concluding behavior is fixed.
- Mobile visual QA is required for every UI-board or event-page change because previous CSS changes caused a white-screen regression and contrast/layout problems on phone.

## Final Core Targeted Retest

The first grouped pass human-validated organization identity, successor-to-member
continuity, Public/Name only/Hidden profile-link behavior, and the host's true
Going total. It exposed three presentation defects and one invalid test setup:
the tested member belonged to a different organization than the event.

The corrected same-organization browser scenario now confirms that an accepted
successor appears in the organization-owned event's teammate selector and can be
assigned without weakening organization boundaries. The remaining human retest
is intentionally short:

1. **Schedule change clarity:** confirm the notification and Event Hub both show
   the crossed-out previous time and updated time while Going remains unchanged.
2. **Same-organization teammate:** use an event owned by the exact organization
   whose successor accepted, and confirm that member appears in Team.
3. **Prominent People search:** search a display name and confirm the People
   category appears directly beneath the search field and opens the profile.
4. **Anonymous true total:** leave one attendee Hidden and confirm host and
   non-host both see the true Going count, while only the host's private
   Participants view exposes the hidden identity.

Exit criterion: all four targeted checks pass. Previously validated flows must
not be repeated. Afterward, remaining work is deferred polish, production
email/external activation, or MVP scope rather than core beta repair.

## Next Reconciliation Tasks

1. Use `02.01.08 Sontu Beta QA Execution Checklist` and `docs/implementation/beta-qa-execution-checklist.md` as the detailed execution checklist for pass/fail testing.
2. Keep the Google Drive authority document current and update this local mirror after authority changes.
3. Review the checklist after each completed prototype slice and update local status from observed behavior, tests, Dev Notes, and telemetry.
4. Add or update a local external-capability activation matrix before controlled external beta.
5. Convert the Drive document's plain text tables into native Google Docs tables if presentation quality becomes important; the content authority is already captured there.

