# Hosting design reconciliation — September 12

Status: reconciled and deployed as Sites version 21; founder confirmed live invitation succeeds.

## Evidence

Reviewed repository b6d5d3dee0c43cb6e1321db5d47592aeac75a383, current UX sections 29–30, current Technology invitation-policy resolution, Product Foundation, Domain & System Behavior, User Journeys, Validation Roadmap, and Governance. Earlier holds are historical where later founder session instructions explicitly authorize implementation.

Visually inspected the Drive Mobile Host Workspace Flow (file 1K_OSGJnGNQuSWG9i226Pb2Q6c1oWL5qE), One Platform Every Event / progressive portal board (1JHpaQwPhrZxtUo5sS2jVspuAdCptCVss), and Design System / Responsive Showcase (1XLGLA5TngrdpRybhvkFRDlAYlaxJ22vu). Other recent Brand boards were surveyed in a contact sheet; no presentation boards were added to runtime assets.

## Confirmed mismatches and corrective direction

- Compact overview: reference prioritizes Event Status, compact Key Stats, then Next Up. Implemented connected overview stacks large guest summary, event details, reconfirmation and delivery panels. Restore the reference hierarchy using real lifecycle/attention and guest counts, without fabricated On track, check-in or page-view metrics.
- Wide portal: reference uses an event banner, compact metric row, grouped quick actions and secondary panes. Current connected shell retains a utilitarian identity row and large generic panels. Restore composition while preserving the same permission/state contract.
- Simple-event scope: inactive reconfirmation and simulated delivery concepts occupy routine overview space. Move secondary detail behind relevant context; show actionable material-change attention when applicable. Do not add Team, To Do, Resources, Admission or Analytics merely because boards show them.
- Preserve exact consumer roots and their disappearance in focused hosting. Preserve square compact identity imagery, wordmark usage and semantic Classic Ocean tokens. Reject generated navigation/token/policy drift.

## Invitation failure: evidence boundary

Host-generated URLs use browser origin + pathname + hash invitation token. Local browser checks passed named-recipient access and account-return flows, but did not establish live copied-link usability through Sites owner-only access. Current technical authority explicitly conditions external invitation activation on verified email delivery and permitted hosting access. Hosted OTP remains disabled, and accountless verification therefore remains unavailable on the deployed beta.

Do not infer the founder's failure is hosting access, incorrect recipient account, malformed URL, expiry/revocation, or authentication without the actual failing screen/URL shape. Request a screenshot of what appears after opening the copied link; do not request a password or expose private invitation tokens in logs/reports. No access controls were changed and no live-link fix is claimed.

## Acceptance evidence

Commit bc705a746c6eee8f6c61a9adc27933d4266c3fbe passed lint, typecheck, 38 local tests and all 60 browser checks. Inspected captured compact light hosting, compact Event Hub, and wide dark hosting against the cited boards. CI run 34720221809 is isolated authenticated evidence, not observation of the founder’s live session.


## Founder follow-up and correction

The founder confirmed that the live invitation succeeds after signing out of the host session, creating the named invitee account, and signing in. The earlier denial is therefore not evidence of a broken link. All users are potential hosts and participants; UX section 30.26 now explicitly locks neutral account language.

Implemented reconciliation: compact Event status, Key stats and Next up; a wide event banner; inactive simple-event reconfirmation and simulated message panels hidden; clearer Event Hub hierarchy; neutral sign-out. Real counts only, no generated check-in/page-view metrics or broad operations expansion.

Diagnostics: bounded session-local error category/time/reference records, accessible in Help & Support for deliberate copying. No remote ingestion, session replay, raw error text, request payloads, URLs, identities or invitation tokens. These diagnostics do not let an agent silently observe a user's session.

## Founder-authorized continuation

The Core Validation checkpoint boundaries are historical. Founder direction after
this reconciliation authorizes the connected continuation, while preserving one
universal personal account and the simple-event experience:

- RSVP confirmation creates an authoritative admission; check-in requires a
  valid admission, which is invalidated on withdrawal or event cancellation.
- Participant and host surfaces expose admission status. Event-day check-in
  remains online-authoritative; it does not imply offline acceptance.
- Private order/payment-state foundations may exist without prices, checkout,
  subscriptions, paywalls, refund UI, or live provider integration. Payment
  transitions are auditable and control order-sourced admission validity.
- Host analytics show only counts derived from RSVP, capacity, invitation,
  delivery, admission and check-in records.
- Bounded assistance may draft, summarize and flag. It never autonomously
  publishes, sends messages, charges, refunds, changes access or settles an
  obligation.

Advanced floorplans, enterprise suites, vendor or venue operations and live
provider integrations remain outside this continuation.
