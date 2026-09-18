# Sontu Local Beta Acceptance Contract

Status: LOCAL EXECUTION CONTRACT

Last reconciled: 2026-09-17

## Authority And Evidence

- Google Drive defines intended product behavior and scope. The controlling chain is Drive Governance, Product Foundation, User Journeys and Acceptance Evidence, Domain and System Behavior, Experience Architecture, Technology and Data Architecture, Legal/Privacy/Safety, the Beta/MVP Feature Checklist, and the Beta QA Execution Checklist.
- The local repository is executable evidence. Passing tests prove only the behavior they exercise.
- The running local Supabase stack is persistence and authorization evidence. Files or configuration alone do not prove runtime behavior.
- Human acceptance remains distinct from AI validation. A workflow is human validated only when the exact desktop or phone journey succeeds in the running prototype.
- GitHub Pages and other hosted deployments are not beta acceptance targets for this local-only workstream.

## Beta Core Journey

The beta is acceptable when a host and participant can complete one coherent event lifecycle:

1. A user signs in, restores a session after reload, edits a profile, and sees the correct avatar and permitted profile fields.
2. A host creates a draft, saves and resumes it, uploads a cover, sets core event details, previews, and publishes.
3. A public viewer can discover and open the event. A signed-in participant can choose Interested or Going. A signed-out guest can RSVP and regain private access through the local email/testing path.
4. The host can invite and manage participants, revoke or reissue private access, remove an RSVP, edit a published cover, and make a material schedule or location change.
5. Affected participants see honest state, including reconfirmation, cancellation, withdrawal, protected details, and history where applicable.
6. Dev Notes and telemetry retain enough evidence to diagnose attempted and terminal outcomes without storing secrets.

## Required Identity And Data Boundaries

- Personas: host, signed-in participant, signed-out guest, invited participant, unrelated signed-in user, and anonymous viewer. Organization behavior is required only for organization-specific scenarios.
- Account data persists across reload and sign-out/sign-in. Signed-out Dev Notes persist locally; signed-in notes sync to local Supabase.
- Public, unlisted, restricted, and connected-event projections expose only permitted fields.
- Profile field visibility honors General, Close, and Only-me independently for bio, interests, links, contact email, phone, and location.
- Uploaded avatars and event covers are stored in the correct bucket and folder boundary. Users can modify only their authorized objects.
- Consequential actions must have persisted database and audit or telemetry evidence, not only a success message.

## Required Surfaces

Desktop and compact mobile must support the same core behavior on:

- Home, Discover, Events, Feed empty state, global search, notifications, and profile drawer;
- profile editor, own profile, public profile, Relationships, settings, privacy/support utilities;
- event creation, preview, public event detail, connected Event Hub, and Host Workspace;
- guest RSVP, invitation response, protected virtual details, cancellation/history, Dev Notes, and Help/Support.

The target compact devices include older mobile WebViews. Core flows must not depend on unsupported APIs such as `crypto.randomUUID`, and CSS or JavaScript must avoid syntax known to blank those WebViews.

## Error And Recovery Contract

- No operation may remain indefinitely in Loading, Saving, or an unresponsive button state.
- Retry must be idempotent for draft creation and other retriable writes.
- Unknown command outcomes instruct the user to refresh before retrying and must not create duplicates.
- Validation errors identify the failing field or rule. Permission and compatibility errors must not be mislabeled as user-input errors.
- Empty, loading, success, partial-delivery, revoked, cancelled, and unavailable states are visually distinct and readable.
- Local email simulation must be labeled as simulation; the UI must not claim that a real email was delivered.

## Security And Privacy Contract

- No service-role or secret key is shipped to the browser, telemetry, Dev Notes, URLs, or documentation.
- Exposed tables use RLS and explicit grants. Policies authorize ownership or relationship, not merely the authenticated role.
- Privileged functions have explicit execution grants and verify the caller and target event or account.
- Private links and tokens are redacted from telemetry. Revocation invalidates old access even after reissue.
- Protected join information and participant details are unavailable to anonymous, unrelated, withdrawn, removed, or revoked viewers.
- Storage replacement requires and verifies the complete insert/select/update policy path.

## Acceptance Evidence

AI validation requires all of:

- `npm.cmd run check` passes;
- the full local database integration suite passes against the running Sontu database;
- the compact browser regression suite passes serially against the current local app;
- migration history matches the repository and targeted persistence/RLS readbacks pass;
- the local app, Supabase API, Studio, and mail inbox endpoints respond.

Human validation requires the exact grouped cross-device script in `local-beta-test-runbook.md`. A code fix remains Needs retest until observed on the relevant physical device. Visual acceptance requires direct inspection; test assertions alone cannot approve layout, contrast, density, or scroll behavior.

## Beta Blockers

- Any core journey write that does not persist or cannot recover.
- Authorization leakage, secret exposure, stale revoked access, or incorrect profile visibility.
- Mobile white screen, frozen action, horizontal page overflow, or navigation that prevents completion.
- Incorrect participant counts or lifecycle state after RSVP, removal, material change, cancellation, start, or completion.
- Misleading delivery, validation, or success claims.

## Explicit Non-Goals

- Cloud promotion, GitHub push, production email delivery, payments, refunds, or production operations.
- Pixel-perfect polish, full localization, every accessibility preference, or every long-term host workspace module.
- Waitlists, advanced plus-one handling, rich personal social feeds, follower competition, or public private-group taxonomy.
- Proving demand, product-market fit, scale, reliability under production traffic, or Gate advancement.

## Release Decision

Local beta readiness means the core journey is AI validated and the grouped human regression has no unresolved beta blocker. It does not authorize deployment or advance a governance gate. Cloud promotion requires a separate founder decision after evidence review.
