# Checkpoint 3 — Simple events

Founder authorized the proposed three slices after accepting Checkpoint 2. Remote state recovered at `87e5c9ca2cd674a94a3dd1179fad814c4162e305`; no later source changes found. The dedicated Sontu database still had the three Checkpoint 2 migrations. Preserve the existing fixtures and both earlier PRs.

## 3A: draft and publication

Personal ownership, one occurrence, optional reviewed cover choice, title/description, explicit timezone and start/end, physical location, optional participant limit, recoverable draft, review and deliberate publication. Published updates continue through the existing governed command path. Draft versions may omit timing; publication requires valid future timing and complete identity/location. No participants are invented for a new simple event. Images are selected from the existing licensed runtime set; uploads are not activated.

Source: current Experience Architecture creation specification, sections 25–30 and the wordmark/token/responsive lock; Technology architecture's single-state, typed-projection and accountless proportional-access rules; founder's explicit Checkpoint 3 authorization. Old Joy feature breadth is not activated.

Draft mutation uses the same transaction, ownership, operation identity, expected version and audit boundary as Checkpoint 2. Save/continue persists at step boundaries. Interrupted saves retain the exact request through reload. Unknown outcomes block new writes until resolved. Time entry uses the selected event timezone rather than the device timezone; nonexistent/repeated daylight-saving times are rejected instead of silently shifted. Changing timezone preserves the instant and shows its new local representation.

Publication makes the event active in the owner's workspace. It does not distribute invitations or publicly expose event facts. The new participant limit is configuration only until the invitation/commitment slice implements authoritative capacity enforcement.

## Decision needed before 3B

For real private invitations, determine whether possession of a forwarded link is sufficient authority to respond as its named invitee, or whether that person must verify identity (without necessarily creating an account). The current Core Validation links deliberately use the first, low-assurance model for synthetic participants. UX private-access rules explicitly say a token is an access input, not proof of the person; later domain authority permits accountless low-consequence participation when policy permits. These do not select a real-invitation forwarding policy.

Do not silently carry the synthetic bearer model into real protected invitations. Keep hosting owner-private and existing test response behavior unchanged until this decision. Invitation status, initial commitment and later reconfirmation must remain distinct. Slice 3C's consumer relationship projection follows 3B; an unverified email or display-name match must never claim an account relationship.

## Verification

33 unit/domain/PostgreSQL integration tests pass with lint, types and production build. Browser coverage adds draft recovery after lost response, timezone entry, saved-draft resumption, review accessibility/reflow and publication across compact/medium/wide, while retaining the existing 48 tests. See the PR's CI results for observed browser completion.

## Founder decision and implementation: 3B–3C

The founder approved recipient email verification for named private invitations, without mandatory Sontu account/profile setup. New events now default to the device's IANA timezone; saved event timezones do not change when the device travels. Device detection requires no location permission and falls back to UTC when unavailable. The detected zone is part of the persisted idempotent creation request and validated by PostgreSQL.

Invitations record a normalized recipient email separately from commitment and reconfirmation. Only the matching Auth-verified email can read or respond; forwarding a token alone grants nothing. Passwordless verification creates a minimal security identity/session in Supabase Auth, not a public profile or a required password/onboarding flow. No user-editable metadata is trusted. Base-table access stays denied, and the older synthetic response RPC cannot bypass real-invitation verification.

Acceptance revalidates current event version, lifecycle and capacity under the event lock. Declining does not fabricate commitment. Withdrawal releases participation and settles an applicable response requirement without rewriting history. Revoking a link removes its access, not an existing commitment. New invitations never reserve capacity or report email delivery. The host manually shares the generated named link; automated invitation delivery remains out of scope.

Verified email relationships and ownership project into Invited, Upcoming and Hosting, and the Event Hub uses that same event identity. Interest/save is not yet activated for real events. Anonymous browsing retains the existing design fixtures; authenticated Events displays actual accessible simple-event relationships.

### Delivery activation boundary

The email-code UI is built and tested against isolated Auth with captured local mail. Hosted email-code requests remain gated by `VITE_INVITATION_VERIFICATION_ENABLED` until SMTP, sender identity and both Auth verification templates are configured and verified. Local templates in `supabase/templates/verification.html` include the OTP; configuration must also be applied to hosted Magic Link and signup confirmation templates. No hosted Auth settings are silently changed by the local test config. Current hosted SMTP/template configuration has not been verified through the available connector.

Supabase's default sender only delivers to project team addresses and is unsuitable for general invitees: https://supabase.com/docs/guides/auth/auth-smtp . Custom SMTP and a verified sender are required for external testers. The existing Sites owner-private gate also remains; external hosting access is activated only together with a working verification path. Do not claim real external invitation delivery or public test readiness before those steps.
