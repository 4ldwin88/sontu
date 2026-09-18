# Local prototype baseline - September 15, 2026

Status: LOCAL WORKING BASELINE

This note reconciles the current local Sontu prototype with the current Drive authority and the local Supabase-backed implementation. It is intentionally lean: use it to choose the next safe slice, not as a full audit replacement.

## Current authority

Drive remains the product, behavior, and visual authority. The current Experience Architecture document keeps the consumer roots locked to Home, Discover, Events, and Feed. Profile enters through the avatar. Hosting is contextual through hosted event cards/details and the event workspace, not a permanent global mode.

The same authority treats Board A as a profile and relationship direction: Follow and Connection are separate; Followers and Following are explicit relationship sections; Close and Groups are private owner tools; profile/event context must not become a generic personal social timeline; profile work should use the existing Sontu visual language rather than inventing a new aesthetic.

## Local app baseline

The local prototype currently includes:

- authenticated consumer shell with Home, Discover, Events, and Feed;
- public and connected event hubs;
- invitation response and notifications;
- event creation and host workspace flows;
- participant admission/check-in foundations;
- profile drawer, profile editing, public profile hub, mini profile preview, follow/connect controls, followers/following, connection requests, Close, and private groups;
- local phone-testing configuration and local Supabase Auth templates.

The local app is now the active prototype surface. GitHub/hosted CI is not required for day-to-day local development.

## Local Supabase baseline

The local Supabase migrations already cover the main event model, account profiles, invitations, event hubs, participant visibility, admission/check-in, host operations, privacy/support intake, connection contexts, follows, profile interests, and public profile activity. No schema change was made in this reconciliation slice.

Current local phone-testing Auth uses LAN-friendly link templates rather than the isolated CI six-digit OTP path. That difference is expected and should not be treated as a product regression by itself.

## Reconciliation applied

The profile relationship surface was lightly realigned with Drive authority:

- renamed the user-facing utility surface from Connections to Relationships where it frames the broader hub;
- kept the People tab as the mutual Connections section;
- made Follow and Connect language clearer and separate;
- changed the public profile tab label from Activity to Events to avoid accidental personal timeline framing;
- removed hard-coded family/friends-style placeholder taxonomy from group creation copy;
- kept groups explicitly private.

Verification: `npm run check` passed locally after the change.

## Recommended next slice

Next best slice: complete the relationship/profile hub as a mobile-first, visually polished Sontu surface backed by the existing local Supabase functions.

Priority order:

1. Improve the Relationships page layout from utility/settings-page feel into a compact relationship hub while preserving the consumer shell.
2. Add clearer row actions for Follow, Connect, Close, group assignment, and pending request states without oversized action clusters.
3. Visually QA public profile, mini profile sheet, and Relationships on phone widths.
4. Add or extend tests around the Board A anti-drift rules: four roots remain locked, no personal timeline label, groups remain private, Follow does not imply Close visibility, and relationship actions stay separate.

Do not add a new global People/Profile root, a personal feed, a follower leaderboard, public friend/family taxonomy, or host-quality claims.