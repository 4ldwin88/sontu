# Sontu Beta Foundation Readiness - 2026-09-17

Status: READY FOR GROUPED HUMAN REGRESSION

## Reconciled State

- Drive remains product and governance authority. The current beta scope is owned by the Beta/MVP Feature Checklist; the Beta QA Execution Checklist owns execution evidence.
- The local repository is on `main` with extensive pre-existing uncommitted work and is one commit behind `origin/main`. No pull, merge, reset, commit, or push was performed because doing so would risk mixing or overwriting the active local prototype.
- GitHub Pages and hosted Supabase are outside this local beta acceptance boundary. The local project is not linked to a hosted Supabase project.
- Local Sontu Supabase is healthy on API `55321`, database `55322`, Studio `55323`, and mail inbox `55324`. Runtime migration history reaches `20260917030721_profile_contact_fields.sql`.
- The local app is configured for LAN access at `http://69.194.47.153:5173` for the current network session.

## Acceptance Contract

The core journey, data boundaries, required surfaces, recovery states, security expectations, evidence rules, blockers, and non-goals are locked in [Sontu Local Beta Acceptance Contract](./beta-acceptance-contract.md).

This contract does not advance a governance gate. It defines the evidence required to call the current local prototype beta-ready.

## Verification Evidence

- `npm.cmd run check`: passed.
- Lint and type checking: passed.
- Unit and integration tests: 81 of 81 passed, including 42 database integration cases.
- Production build: passed.
- Compact browser regression: 26 of 26 passed serially against disposable local accounts and the running local Supabase stack.
- Migration readback: latest local migration is present.
- N88 resource-intelligence readback: the SONTU instrumentation pilot contains the verified 2,519.36-credit starting observation and the later 2,502.7174 account observation. The measured aggregate delta is 16.6426 credits, approximately USD 0.60 at the stated USD 0.036-per-credit assumption before tax. Attribution remains low-confidence because account activity may overlap.

Build warnings remain for the unresolved runtime `../images/sunset.jpg` reference and a JavaScript chunk slightly above 500 kB. Neither blocked the verified core journeys; both remain optimization work rather than beta blockers.

## Remaining Gate

The foundation is AI validated, not human validated. The remaining beta gate is one grouped cross-device regression using the desktop signed-out session and the two signed-in phones. The exact workflow is in [Local Beta Test Runbook](./local-beta-test-runbook.md).

Stop and record a defect if any of these recur:

- white screen, frozen action, indefinite loading, or horizontal page overflow;
- mobile navigation fails to return;
- RSVP, invitation, removal, reconfirmation, cancellation, organization, or host-workspace state fails to persist;
- profile visibility or protected event information leaks;
- the UI claims delivery or success without persisted evidence.

## Explicitly Deferred

- Broad cosmetic polish, full light-theme redesign, localization, and non-blocking density refinements.
- Production email, payments, refunds, production traffic, and cloud deployment.
- Long-term host modules and product expansion not required for the core beta journey.

## UI-board reconciliation note (2026-09-18)

- The founder-approved Sora-led typography direction is now the production UI choice. Sora 400/500/600/700 is bundled locally and the canonical design token no longer identifies Inter as the product UI family.
- Board radii, muted surfaces, and restrained elevation now originate in the shared design-token package. The legacy board-alignment selectors consume those tokens instead of declaring a second competing radius and shadow system.
- The beta conformance target covers the consumer shell, Home, Discover, Events, Feed, lightweight profiles and relationships, Event Hub, event creation, the focused Host Workspace, organization ownership/membership continuity, and critical loading/empty/error states.
- The richer organization-discovery/public-organization experience in Board E and the distinct staff, volunteer, speaker, vendor, safety, and advanced operational modes in Board F remain later-stage scope. Their board presence is product direction, not evidence that those modules are complete in this beta.
- Final visual acceptance still requires representative signed-in and signed-out data at phone, intermediate, and wide breakpoints in both Light and Dark after local Supabase is available.

## Repository Decision

The full pre-reconciliation worktree was preserved locally in commit `a3b2b2b` on branch `preserve/sontu-full-wip-20260918-ui-audit`. The active UI reconciliation branch descends from that exact snapshot. Nothing has been pushed or deployed.
