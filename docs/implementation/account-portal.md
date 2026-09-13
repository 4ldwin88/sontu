# Account portal checkpoint

Authority recovered September 12: UX sections 30.22–30.25 (updated 18:17 UTC), current Brand folder onboarding board `file_00000000428c822f966a268867d17a3d.png`, current production wordmarks. Written authority overrides generated extra signup fields and example age rules. Remote implementation base: 87aefe053d94b7c648093921efcdda5c02261358; no later remote changes found. Dedicated branch checkpoint/account-portal.

## Implemented
- Focused responsive sign-in/sign-up portal, existing production wordmark, Classic Ocean semantic colors, wide editorial imagery. Google and Apple are disabled placeholders, not simulated sign-ins.
- Email/password sign-in and session persistence. Guarded internal return destination preserves creation/hosting context. Password-manager autocomplete, password visibility control, labelled rule checklist, pending and honest failure states.
- Registration transaction does not collect profile fields. Minimum first name is a separate resumable authenticated step; optional personalization is deferred to later setup.
- Private account profile keyed by immutable Auth UUID, generated recognizable unique handle, nonunique display-name fallback, backend canonicalization/uniqueness/reserved handles. First selected handle has no cooldown; subsequent changes require 30 days. Profile writes use server revisions; repeated creation recovers existing profile. No public profile search or discovery is activated.
- Signed-out drawer offers Sign in/Create account without fabricated identity. Authenticated profile drawer and Edit Profile use the real persisted profile.
- Local Supabase enforces 8 characters plus uppercase, lowercase, digit and symbol. Client checklist matches the documented Supabase symbol set. Existing login never rejects passwords solely for failing new signup rules.

## Activation boundaries — not solved by this UI
September 12 founder correction: enable real registration for the existing owner-private beta; founder confirms hosted password requirements are configured. Missing production policy URLs must not silently disable this private test. The form instead displays an explicit private-testing data/reset notice and requires acknowledgement. Submitted Auth metadata is an untrusted notice-version hint, not authoritative legal-consent evidence. This does not approve public registration or replace the production Terms/Privacy and acceptance-evidence work. VITE_REGISTRATION_ENABLED=false remains an explicit emergency presentation pause, not an authorization control. Production policy links are used when configured together. Email confirmation and named-invite verified-email checks remain enforced independently; default Supabase delivery restrictions may require the founder's project-team email.

Private-beta registration passed 37 unit/database tests and 57 browser tests against isolated Auth. Founder subsequently created a real account, received confirmation mail and signed in successfully, but reported a broken confirmation return. Founder requested temporary signup confirmation removal. The connector does not expose hosted Auth configuration. Confirmation remains enabled pending a separate email-assurance safeguard: disabling Supabase confirmation can auto-confirm arbitrary claimed addresses, so email_confirmed_at alone must not grant named-private-invitation access under that configuration. Do not tell the founder to disable it before that safeguard exists.

Accountless private invitation verification remains separate: verifying an invitation does not itself create a completed Sontu profile. Ordinary authenticated product entry requires minimum-profile setup; permitted invitation actions remain available without that profile.

No provider OAuth credentials, hosted Auth settings, external email sender, hosting audience or existing event contracts are changed. No age/DOB or unrelated identity fields collected. No claim of completed accessibility compliance.
