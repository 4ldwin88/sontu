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
