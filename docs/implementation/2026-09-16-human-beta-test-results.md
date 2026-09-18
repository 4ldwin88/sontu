# Sontu Human Beta Test Results - 2026-09-16

Status: LOCAL HUMAN TEST EVIDENCE

This record captures the live end-to-end session performed across three primary surfaces:

- Signed-out desktop browser
- Galaxy Note 9 signed in as a non-host participant
- Galaxy S25 signed in as a host or second participant
- A third signed-in account was used for connection-state verification

Nothing in this record implies production readiness. Human validation applies only to the exact observations below.

## Executive result

The core event path is visibly real: profiles and avatars persist, hosts can create and publish events with uploaded covers, public discovery works, signed-in and guest RSVPs can be created, discussion works, cancellation propagates, relationships persist, and Dev Notes reach local storage and Supabase.

The beta is not ready for an unassisted test cohort. Several consequential host and participant actions are blocked by two systemic defects, and multiple mobile layouts fail visual acceptance.

## Systemic blockers

### Mobile command identifier compatibility

Several commands call `crypto.randomUUID()` directly. The tested mobile WebView does not provide that function on the local HTTP origin. The same failure blocked or interrupted:

- Invitation Going and Can't go responses
- Organization creation
- Event team changes
- Starting an event
- Check-in and credential commands
- Completing an event
- To-do and resource commands use the same command path and are therefore not ready for mobile validation

Required repair: route every client operation identifier through the existing compatible UUID helper, then search the entire client for direct `crypto.randomUUID()` calls and retest all affected commands.

### Private wrapper execution permissions

Live Postgres logs confirmed missing execution permission behind public wrappers for:

- RSVP form configuration
- Ask-host questions
- Participant admission projection
- Participant communication history
- Host operational analytics
- Host credential lifecycle analytics
- Event seating

Required repair: audit every public security-invoker wrapper against its private function, add one complete migration, test the real authenticated PostgREST path, and avoid piecemeal grants.

## Human-validated passes

- Both uploaded avatars render in the top-left button, drawer, owner profile, and viewed profile.
- Profile edits persist; general, close-only, and only-me visibility boundaries behaved correctly.
- Marking a connection Close exposed close-only bio while only-me interests remained private.
- Draft creation, save, exit, resume, and field/cover persistence passed on mobile.
- Preview content was correct, though its layout failed visual acceptance.
- Publishing succeeded and the event appeared on Home, Discover, Hosting, Upcoming, and the public page as appropriate.
- Uploaded covers propagated across desktop and both phones.
- Changing a published cover propagated to other sessions.
- Signed-in Going updated the attendee count across all sessions.
- Guest RSVP created a Going participant and the immediate private response page opened.
- Link revoke changed to revoked and exposed Reissue.
- Material date edits saved and propagated across devices.
- Signed-in and signed-out Dev Notes persisted; both test notes reached Supabase.
- Session sign-out/sign-in preserved avatar, profile, connection, RSVP, and Dev Note state.
- Event search filtered to Party and opened the correct event on desktop and mobile.
- Connection request delivery, acceptance, mutual removal, follow, and unfollow persisted across accounts.
- Private-group creation, membership, and automatic persistence passed.
- Event-email preference persisted after reload.
- Privacy data-copy request reached Received status in the UI.
- Private support report reached Received status in both the UI and database.
- Accessibility settings saved in the database.
- Discussion enablement, participant posting, host hiding, and discussion closure propagated across accounts.
- Event cancellation propagated, blocked new participation, left active discovery, and remained in host History.
- Pre-event check-in buttons were correctly disabled.
- Event Assistant showed bounded behavior, correct available counts, and editable reminder text without sending.
- Event History recorded versions, cover/date changes, RSVPs, links, and discussion activity.

## Functional failures and gaps

## Repair status after the human pass

The following items are repaired and AI-validated locally, but remain pending a
new human validation pass unless explicitly noted otherwise:

- Mobile-compatible request IDs now replace direct `crypto.randomUUID()` use.
- Public security-invoker wrappers have the private execute permissions needed
  for host RSVP removal, event lifecycle commands, RSVP forms, questions,
  analytics, seating, team changes, and participant projections.
- Material-change reconfirmation is now exposed in the signed-in Event Hub.
- Published events cannot be completed before they are started.
- Signed-in Dev Notes preserve the just-saved note while cloud history loads.
- Same-device guest recovery can open the locally saved private RSVP link.
- Home shortcuts were removed; compact viewport overflow and upward navigation
  restoration were repaired and browser-checked at 360 px.
- Connections counts and the Connections tab now include accepted connections
  only. Private groups support rename, delete, and member removal.
- Event accessibility information renders publicly, and signed-in attendees can
  submit the same private accommodation request supported for guests.
- The signed-in Event Hub now shows accessibility details and accommodation
  requests. A two-account browser scenario proves participant submission, host
  acknowledgement, private host questions, host replies, and participant receipt.
- Global discovery now searches public people by display name or handle.
- Participants now have an Events History view for cancelled, completed, and
  ended events they joined.
- Event-detail title and host spacing were tightened, the redundant Host badge
  was removed, and event/relationship badge contrast was increased.
- Event creation preview now uses a direct, denser surface without nested card
  framing, and its repeated draft metadata was removed.
- Light mode now has distinct page, panel, and elevated surfaces. Ocean and Navy
  accents now change selected and informational states as well as primary actions.
- Host workspace navigation is grouped into Overview, People, Plan,
  Communications, and Insights with contextual tool navigation and a sticky
  compact mobile header.
- Closing an event discussion now blocks posting while preserving visible posts
  as read-only participant history.
- Empty or hidden public profile fields no longer produce misleading placeholder
  copy. Owner privacy states reuse the globe, people, and lock icon language.
- Organization setup and editing now support real storage-backed images through
  an owner-folder-scoped public media bucket. The duplicate empty-state setup
  action was removed.
- Private group member selection now searches accepted connections by name or
  handle instead of using an unscalable dropdown.
- Profiles now support optional contact email, phone, and location fields with
  independent General, Close, and Only me visibility. Database and browser tests
  prove owner editing, persistence, public rendering, and visibility boundaries.
- Published-event schedule editing preserves the event duration when the start
  moves; the end remains independently editable afterward.
- Host History collapses adjacent identical saved revisions and labels public
  and guest joins as participant activity instead of implying host activity.
- Public event pages now use a compact sticky mobile action bar for RSVP status,
  Going, Interested, guest RSVP, or Manage event. It replaces the ordinary
  mobile bottom navigation on event routes while leaving desktop actions in the
  event information panel.
- Cancel event now uses explicit destructive styling both at entry and at final
  confirmation, while retaining the existing confirmation dialog.
- Cancellation creates a durable unread notification, opening Notifications
  clears it, and the cancelled event remains in the participant's History.
- In-progress events can now be cancelled through the same idempotent host
  command used before start. The transition preserves audit history and
  invalidates admissions; the focused compact-browser lifecycle test passes.
- Host RSVP removal now lives only in Manage Event. Its compact-browser test
  proves the participant is released and admission is invalidated.
- Light-theme interactive text and event badges now meet the automated WCAG AA
  contrast check on Home, Discover, Events, Feed, and invitation response views.
- The disposable local browser-test setup now works on Windows, uses the active
  local Supabase ports, and creates a unique isolated account per run without
  deleting historical test identities.

Automated evidence after these repairs: 81 application tests, 42 database
integration tests, lint, typecheck, production build, anonymous-role member
search, applied local migrations, two compact authenticated core lifecycle
tests, five compact shell/invitation accessibility tests, and compact Chrome
rendering all passed.
These results belong in the AI-validated column; the original human failures
remain the authoritative human status until the next grouped retest.

### RSVP and participation

- Interested saved according to telemetry but gave no visible confirmation and did not appear in the Interested filter during the observed flow.
  A two-account compact-browser regression now passes the full state transition:
  Interested becomes visibly selected, appears in the Interested filter, yields
  to Going, disappears from Interested, and appears in Upcoming. This remains
  AI-validated until the grouped cross-device retest.
- Host Remove RSVP failed from both the Event Hub shortcut and Manage event. Four attempts and four failures were recorded; counts remained unchanged.
- Guest confirmation email was unavailable during the test.
- Guest private-link recovery by email produced no response.
- A reissued private response link opened an invitation error instead of the participant management page.
- Same-device guest state now reloads from its saved private credential, the
  compact private route exposes Leave event, withdrawal releases capacity and
  invalidates admission, and a second signed-out browser changes from Event
  full back to RSVP after withdrawal. This is AI-validated pending the grouped
  human retest.
- Simple-event host link dialogs no longer offer the misleading Open participant
  response action: recipients must verify their own email, while hosts can copy
  or email the private invitation. Database coverage now proves a revoked token
  stays invalid after reissue and the replacement token works.
- Material date change did not create a visible reconfirmation requirement or participant action.
- Invitation Going and Can't go were blocked by mobile UUID compatibility.
- Cancellation notification existed but did not create an unread indicator.
- Cancelled events disappeared from participant event history and remained discoverable only through Notifications; hosts retained History correctly.
- Protected online access now has a three-session browser proof: the host can
  save and reload private join details, signed-out and signed-in nonparticipants
  cannot read them, Going releases them to the confirmed account, and withdrawal
  hides them again. The test exposed and repaired a connected-hub bug that sent
  public-participant withdrawal through the invitation-only command.

### Host operations

- Organization creation remained stuck on Saving and created no database record.
- RSVP form configuration failed due database permission; no questions persisted.
- Ask host failed due database permission; no question persisted.
- Analytics failed due database permission and displayed no estimates.
- Seating failed due database permission and created no table.
- Accessibility information was saved but did not appear in the participant Event Hub.
- Accommodation requests were absent from the participant Event Hub.
- Team assignment was blocked by mobile UUID compatibility and did not persist.
- Event start was blocked by mobile UUID compatibility; Party remained Published.
- Check-in could not be opened because event start failed.
- Results incorrectly said Ready and offered Complete event while Party was still Published with unknown attendance.
- Complete event was blocked by mobile UUID compatibility and left Party Published.
- To-do and resource mobile commands require retest after the shared UUID repair.

### Connections and profiles

- Global search finds events only; people discovery is missing.
- Find someone requires an impractical generated handle and does not preview identity before Follow or Connect.
- Pending inbound and outbound requests appear inside Connections and inflate the established connection count.
- Private groups cannot be renamed or deleted.
- Group member selection is a non-scalable dropdown rather than searchable accepted connections.
- Group count copy says `one people`.
- Public profiles show misleading empty-copy for fields that exist but are hidden; hidden/empty sections should disappear.
- Contact/business-card profile fields are incomplete. Email and other contact routes must be optional with explicit visibility controls.
- Owner profile privacy labels should reuse the editor's privacy icons with accessible labels.

## Mobile and visual failures

- Home has horizontal overflow on both tested phones.
- Header and bottom navigation intermittently fail to return when scrolling upward on both phones.
- Remove the four redundant Home shortcuts below the hero; Featured for you should follow the hero.
- Light theme failed visual acceptance; Dark was acceptable and persisted.
- Accent choices appeared to have no visible effect.
- Connection summary cards and event category badges had inadequate contrast.
- Empty-state content was compressed to the left with excessive unused width.
- Event detail title is oversized and the current host row wastes space.
- Preferred event detail redesign: smaller title; desktop host/team in the right information panel; mobile sticky event action bar replacing normal bottom navigation; no redundant Host badge.
- Event creation repeats event type/format, misaligns the Unsaved changes badge, and uses excessive whitespace.
- Event preview has nested cards and excessive vertical spacing; use a direct, compact surface and collapse unusually long descriptions.
- Host workspace exposes sixteen flat navigation modules and is difficult to scan on mobile.
- Preferred host workspace: collapsible event header plus sticky grouped navigation for Overview, People, Plan, Communications, and Insights; event type controls available subsections.
- Host-only participant management controls should live in Manage event rather than the participant-facing Event Hub.
- Cancel event needs clear destructive styling.
- Event History should collapse indistinguishable draft versions and use participant-oriented labels instead of ambiguous `join public event` or `join guest event` text.
- Closing discussion currently removes the entire participant section; retain read-only history unless explicitly archived.

## Settings and localization decisions

- Accessibility and Language settings are empty placeholders.
- Language should be the first onboarding choice.
- Country/region must remain separate from language and may drive date, timezone, and regional defaults.
- The profile drawer should expose a globe plus the current language name in its native script; flags may be secondary regional cues, not the primary language model.
- Event email opt-out persisted, but real delivery suppression was not exercised in this session.

## Telemetry and database evidence

- Route activity was recorded throughout the session.
- Both human test Dev Notes exist in `sontu_dev_notes`.
- Host RSVP removal recorded four attempted and four failed events.
- Link issue and revoke telemetry recorded successful backend outcomes.
- Interest saved and removed events were recorded; the observed defect was feedback/filter behavior.
- RSVP form recorded six attempts and six failures.
- Event creation, draft save, publish, and public response telemetry were present.
- The private support report exists with Received status.
- Accessibility settings exist with seating, quiet-space, and Elevator information.
- Party remained Published after failed start and completion attempts.

## Deferred or blocked human validation

- Old revoked link invalidation versus newly reissued link
- Live check-in and credential admission
- To-do and resource mutation
- Team roles and delegated permissions
- RSVP custom-question participant completion
- Seating assignment
- Accommodation request lifecycle
- Analytics accuracy
- Event closeout after a valid start
- Capacity-full behavior
- Protected online join-information release and revocation
- Calendar export/download
- Storage negative-owner operations through the browser
- No-avatar fallback matrix

## Exit decision

Human test pass complete. Repair the two systemic blocker classes first, then fix consequential RSVP/removal/reconfirmation defects, then address mobile navigation/overflow and contrast. Run automated checks and a focused regression batch before repeating this full human pass.

## Repair verification

### Remaining core beta repair checkpoint - 2026-09-17

- Schedule edits now preserve normal attendee RSVP state while exposing the
  latest previous and current schedule in the Event Hub and adding a durable
  unread notification for attendees who joined before the change.
- Organization-owned Event Hubs now identify the organization. Accepting a
  continuity-successor request also creates active member continuity without
  transferring ownership.
- Signed-in invitees matched by verified email are attached to their account
  when they open the Event Hub, allowing public attendee names to open the
  correct profile while preserving name-only and hidden privacy settings.
- Hosts now receive the true Going total, including hidden confirmed
  participants, while non-host viewers continue to receive the privacy-safe
  visible roster and count.
- Global People search was already implemented through the public member-search
  projection; this batch retained it and verified the full local gate rather
  than adding a duplicate search path.
- AI validation: all 82 unit/database tests, lint, type checking, and production
  build pass. Focused compact browser checks pass for durable notification state
  and organization continuity. The grouped cross-device human pass remains
  pending for these five repaired surfaces.

### Targeted closeout repair - 2026-09-17

- Human testing confirmed notification delivery and stable Going state but
  exposed that old/new schedule details were missing. The schedule projection
  is now nested in the Event Hub event payload, and notification cards show the
  crossed-out previous start beside the updated start.
- Human testing used a member from a different organization when checking the
  event-team picker. A corrected same-organization browser scenario passes:
  the accepted successor appears in the organization-owned event selector and
  can be assigned without weakening organization boundaries.
- People search results now appear immediately beneath global search with an
  explicit events-and-people label; the focused browser flow opens the selected
  public profile.
- Every viewer now receives the true anonymous Going total. Hidden identities
  remain absent from the visible roster and remain available only to authorized
  host management surfaces.
- Verification: all 82 tests, lint, type checking, production build, focused
  organization/People browser flow, direct participant Event Hub projection,
  and local database lint pass. Database lint retains only a pre-existing
  profile-helper warning.
- Phase elapsed time was approximately 20 minutes. The account showed about
  381.9 credits remaining at completion. Attribution confidence is low because
  account credits are shared and concurrent work may overlap this phase.

- The local migration ledger is fully aligned through `20260917030721_profile_contact_fields.sql`.
- Runtime browser coverage exposed and repaired two RSVP-form defects that direct database coverage had missed: a record/query alias collision on reads and a missing required audit operation ID on configuration.
- Runtime browser coverage also exposed and repaired Seating audit/projection defects: reads no longer write audit rows, mutations receive an audit operation ID, and the participant projection alias no longer conflicts with the PL/pgSQL record.
- Database integration coverage passes all 42 tests, including repaired command permissions and lifecycle behavior.
- Application checks pass all 81 tests plus lint, type checking, and the production build.
- The complete compact browser suite passes all 26 tests serially. It covers account confirmation and onboarding, business-card profile persistence, invitations, event creation and publishing, Interested-to-Going state transitions and filters, guest RSVP persistence/private management/withdrawal/capacity reopening, protected online-access release and revocation, private participant questions and accommodations, RSVP and reconfirmation, host RSVP removal, admission, cancellation notification/history continuity, in-progress cancellation, organization continuity and membership, event-team assignment, Dev Notes recovery, layouts, accessibility checks, navigation, gestures, drawers, themes, and signed-out identity state.
- The simple-event creation workflow now additionally proves RSVP question configuration and reload persistence, Seating table creation and reload persistence, and accessibility information save and reload persistence through the authenticated UI.
- A two-account organization workflow now proves organization setup, successor acceptance and activation, member addition, event volunteer assignment, and reload persistence without using personal test accounts.
- Browser tests now create a disposable confirmed local account for each run, preventing shared-account contamination without deleting historical users.
- Human validation remains distinct from automated validation. The repaired areas need one substantial cross-device regression batch rather than piecemeal retesting.

## N88 reusable lessons

- Automated evidence and human acceptance must remain separate.
- Real mobile WebViews and authenticated API paths belong in the test matrix, not only synthetic viewports and database simulations.
- Shared failure patterns require a full pattern audit, not endpoint-by-endpoint repairs.
- Consequential actions need attempted and terminal telemetry plus database confirmation.
- Human testing is most efficient as a substantial cross-device batch after automated preparation.
- Preserve useful history and explain hidden or pending state instead of making it disappear or count as complete.
- Promote generalized lessons to N88 without copying personal identities, private links, or fixture secrets.
