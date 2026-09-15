# Checkpoint 2 — Core Validation

Founder authorized slices 2A–2C after accepting the design foundation on September 12, 2026. This scope activates the frozen deterministic workflow; it does not activate the full platform or the later AI proposal adapter.

## Recovered state and preservation

- Design foundation preserved at `4c67442` on `checkpoint/design-foundation` (PR #1).
- Implementation branch: `checkpoint/core-validation`.
- Dedicated Sontu project: `zukfxasttgmtygnsqqav` (Canada Central), initially no application tables or auth users.
- EL8 and Ridgewood are unrelated and untouched.
- Drive authority: Technology & Data Architecture September 10 Core Validation contract plus September 12 reconciliation; User Journeys Fixtures 0–9; Domain State/Settlement/Permission hardening. Fixture 10 (AI proposal adapter) is deferred from the founder-approved 2A–2C cut.

## Implementation decisions

Private, RLS-enabled tables are accessible only through three allowlisted RPCs. Public wrappers use invoker semantics; narrow private definer implementations enforce host ownership or hashed, expiring, revocable participant-link scope. Clients have no base-table reads or writes. This intentionally produces informational "RLS enabled without policies" findings: default deny is the design, not an omitted client policy.

The bounded reconfirmation row also represents its settlement requirement; no generic requirement/task engine. Every accepted case has one required outcome per affected confirmed participant. A released participant is not automatically recommitted after another change. Later material changes replace an existing accepted obligation, preserve historical terminal dispositions and reset only the still-confirmed affected set. Cosmetic versions preserve existing applicability.

Operation identities are serialized before event locks. Consequential writes, audit, and outbox intent commit atomically. Response links use 256-bit client-generated random values; only hashes are persisted, including hashed operation fingerprints. Link reissue revokes the old verifier. Provider/delivery controls are owner-authorized simulations and cannot create live external evidence. Outbox delivery never settles participant responses.

Supabase's default `public.rls_auto_enable()` event trigger is preserved but its unnecessary client EXECUTE permission is removed.

## Testing and environments

The SQL migrations run from scratch in PGlite (PostgreSQL) for deterministic domain/integration tests. Browser CI uses an isolated local Supabase Auth/PostgreSQL stack seeded through the admin API with disposable synthetic accounts. Hosted verification uses separately provisioned non-production synthetic accounts; no credentials are committed. No emails are sent or existing accounts modified.

The hosted frontend uses a publishable key only. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` can select a local CI backend at build time; production defaults target only Sontu.

## Founder test

Events → Hosting → Open working host events → sign in → Create test event → Publish test event.
Change start time and confirm. Require reconfirmation. Open Participants, generate a scoped response link, and respond in a separate tab. Return to Overview and refresh. Simulated delivery cannot settle the case. Review participant counts, provider uncertainty, prior versions, waiver/exception distinction, and cancellation with unresolved obligations.

Historical checkpoint boundary: stop after this human review. This statement
applied to the September 12 Core Validation cut only. Later founder-authorized
continuation, recorded in `hosting-design-reconciliation.md`, activates
admissions, private order/payment-state foundations, real host analytics and
bounded assistance. It continues to exclude public launch, checkout, prices,
subscriptions, paywalls, enterprise operations, native mobile, live provider
integrations and autonomous AI authority.

## Verification evidence — September 12

- `npm run check`: lint, TypeScript, 29 unit/PostgreSQL integration tests, production build pass.
- [Browser CI run 34704245706](https://github.com/4ldwin88/sontu/actions/runs/34704245706): 48 tests pass across compact, medium and wide, including the existing design foundation, host/participant flow, accessibility checks and lost-response/reload/same-operation retry recovery. Runtime source is `cdfd2f22b88820f5e435fd6a310bad17a6810133`; subsequent changes add verification evidence only.
- Hosted Sontu Auth/RPC verification passed ownership denial, anonymous denial, direct-table denial, 11/12 unresolved, 12/12 resolved, released-participant exclusion, stale conflict and concurrent-edit serialization. Reproduce with `SONTU_TEST_ACCOUNTS_FILE=/secure/accounts.json node scripts/verify-hosted.mjs` using two isolated synthetic accounts. This creates a new synthetic event; it never sends mail.
- The interactive cloud preview browser timed out after supported recovery. Automated browser evidence comes from CI against isolated Supabase; hosted verification is Auth/API evidence. Founder review of the deployed private prototype remains the final gate.
- Supabase's leaked-password protection setting remains disabled; this checkpoint uses generated synthetic credentials and makes no public-auth readiness claim. Private-table no-policy notices are expected default-deny findings. Build emits a non-blocking bundle-size warning (approximately 163 kB gzip).
