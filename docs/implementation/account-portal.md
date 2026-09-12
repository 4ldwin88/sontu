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
The current Drive legal document is requirements/planning, not an approved user-facing Terms of Service or Privacy Policy. Do not invent acceptance of nonexistent terms. Hosted registration is OFF by default. It requires VITE_REGISTRATION_ENABLED=true plus approved HTTPS VITE_TERMS_URL, VITE_PRIVACY_URL and VITE_LEGAL_VERSION. These flags are presentation gates, not authorization controls. Before activation also verify hosted Auth password enforcement, confirmation/email behavior, redirect URLs, and implement authoritative immutable legal-acceptance evidence (the form's Auth metadata is only an untrusted submission hint, not consent authority). Do not set these production flags merely to bypass unresolved requirements.

CI enables registration only against isolated local Supabase with explicitly test-only policy URLs/version; no external recipient email is sent. This verifies code paths, not legal approval or live inbox delivery. The user's own-account registration goal remains blocked until those exact prerequisites are resolved. Existing-account sign-in and profile setup are usable independently.

Accountless private invitation verification remains separate: verifying an invitation does not itself create a completed Sontu profile. Ordinary authenticated product entry requires minimum-profile setup; permitted invitation actions remain available without that profile.

No provider OAuth credentials, hosted Auth settings, external email sender, hosting audience or existing event contracts are changed. No age/DOB or unrelated identity fields collected. No claim of completed accessibility compliance.
