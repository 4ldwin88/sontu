# Checkpoint 1 — coded design foundation

## Authority reconciliation, 2026-09-12

Recovered `main` at `058d7a7556a691762aa6a26e31941db4078f17bd`. Changes after the supplied preparation commit are production asset uploads and folder setup; all are preserved. Dedicated branch: `checkpoint/design-foundation`.

Read current Drive UX (modified 12:56 UTC), technology (13:07 UTC), governance, foundation, event model, journeys, domain behavior, and roadmap. UX sections 25–30 and the September 12 stack reconciliation control this checkpoint. The founder's explicit current-session authorization permits this fixture-only coded shell and a testable review deployment; old planning holds do not block it or authorize additional work.

Inspected the current Drive Brand boards, especially Events Journey, Discover, Home, Event Hub, Mobile Host Workspace, Host Overview, Team & Roles, and Responsive/System States. The files retain generated opaque names in Drive. No boards are copied into runtime output.

## Implementation decisions

- React + TypeScript + Vite, npm workspace with `apps/web` and lightweight shared source boundaries. No domain mutation packages or backend are created.
- Hash routing preserves the governed route meanings on static hosting, including deep links and browser history, without requiring an application server.
- Shared projections separate identity/display version, actor relationship, permissions/modules, participation, attention, operations, and presentation metadata. Every sample has `local_fixture` provenance.
- Host Workspace adapts at available widths. Below 850px it uses focused local navigation/cards; wider layouts use the same event projection in Host Portal navigation and tables. Both host route families remove consumer roots.
- System/Light/Dark and two curated Ocean accents; semantic status roles are invariant across accent choices. Exact neutrals, spacing, radii and font remain prototype constants for founder review.
- System UI fallback font initially prioritizes reliable rendering and operational readability. No external font request is required.
- Production repository wordmark files are imported directly. Only the favicon is copied to public output; source-reference boards and unused emblem/app-icon families are excluded by the build.
- Nearby uses a distance-sorted sample list with an explicit manual area. No fabricated geographic map or location permission request.
- Creation and participation actions expose a labelled presentation boundary. They never publish, commit participation, create entitlement or claim admission success.
- Private Sites hosting is used for founder review. GitHub remains the code authority. This is a design prototype, not a production Sontu service.

## Human review route

Home → Discover (search/category/Nearby) → Events (all four tabs) → event → Host Workspace → local Team/To Do/Resources → Close workspace. Feed updates link to the same event identities. Profile/Appearance exposes themes and the state gallery.

Check 375px, 768px and 1440px widths, imagery crops, text size, spacing, light/dark treatment, and the transition from consumer to host context.

## Stop boundary

Checkpoint 2 is NOT authorized by completing this checkpoint. No Supabase, payment, ticketing, real admission, LLM, native app, external messaging or broad feature implementation is included. Founder UI approval is required before functional development.
