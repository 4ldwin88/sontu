# Sontu Technical Bootstrap Contract

Status: READY FOR CODED DESIGN-SYSTEM / ROUTING BOOTSTRAP

This document is subordinate to current Drive authority. It translates the September 12 design lock and technical reconciliation into a repository-facing bootstrap contract.

## First checkpoint stack

- TypeScript.
- React-family responsive web implementation.
- Exact framework/tooling selected at bootstrap for simplest current fit.
- Deterministic local fixtures/projections for presentation-state work.
- No Sontu Supabase project required for the first checkpoint.
- No native mobile bootstrap in the first checkpoint.

React Native/Expo remains a later candidate after responsive shell/native-device requirements are proven. The frozen PostgreSQL/Supabase Core Validation contract remains the backend target when that backend is activated.

## Target repository boundaries

```text
/apps
  /web
  /mobile                  # reserved; do not bootstrap yet
/packages
  /domain                  # framework/provider-free activated domain contracts
  /application             # activated use cases/policies/projection interfaces
  /validation              # shared runtime schemas
  /design-tokens           # semantic visual/responsive tokens
  /ui-web                  # reusable web primitives/patterns
  /test-fixtures           # deterministic non-authoritative projections
  /data                    # generated DB/query adapters when backend activates
/supabase                  # frozen Core Validation DB artifacts when activated
/tests
  /domain
  /integration
  /e2e
  /visual-accessibility
/docs
```

Do not create packages simply to mirror future mockup modules. No microservices, generic workflow engine, payment/ticketing SDK, organization-RBAC package or broad adapter layer is justified for the first checkpoint.

## Route contract

Consumer root semantics are fixed:

```text
/ or /home
/discover
/events
/feed
/events/:eventId
/events/:eventId/host
/host/events/:eventId/...   # wide portal family when implemented
```

`/events` owns Upcoming / Invited / Interested / Hosting local views.

The focused `/events/:eventId/host` workspace removes the consumer bottom navigation and provides an explicit exit/back route.

Explorer / Nearby-Spontaneous / Connector / Planner-Participant are presentation weights, never separate route trees.

## Projection contract

UI must consume typed projections rather than database rows. Representative projections separate:

- event identity and current display/authoritative version;
- actor relationship/context;
- permissions and activated capabilities;
- commitment/participation state when activated;
- material-change/attention state when activated;
- entitlement/credential state only when activated;
- host operational state only when activated;
- non-consequential imagery/category/tag presentation metadata.

Consequential view states use explicit semantic categories such as:

```text
loading
ready
empty
denied
unavailable
error
pending_unknown
```

`pending_unknown` is never rendered as success.

## Design token contract

Classic Ocean brand primitives:

```text
Ocean Light  #38BDF8
Ocean        #0EA5E9
Ocean Deep   #2563EB
Navy         #0F2D5B
```

Components consume semantic roles rather than these values directly. Initial semantic roles include:

- background
- surface
- surface-elevated
- text-primary
- text-secondary
- border
- focus
- interactive-primary
- interactive-hover
- selected
- success
- warning
- error
- info
- destructive
- imagery-overlay

Cosmetic themes may remap appearance roles. They do not remap semantic success/warning/error/destructive/access meaning.

Use a 4-point-compatible spacing scale with 8-point primary rhythm. Exact type family, neutral values, semantic-state values, unlocked radii/image ratios, motion timings and responsive breakpoints remain prototype-measured constants.

## Initial component contract

Foundation:

- `AppShell`
- `RootBottomNav`
- `TopUtilities`
- `FocusedWorkspaceShell`
- `WidePortalShell`

Actions/navigation:

- `Button`
- `IconButton`
- `TextAction`
- `Chip`
- `Tabs`

Inputs:

- `TextField`
- `SearchField`
- validation/error messaging

Event presentation:

- `EventCard` with hero/editorial, compact-square and list/operational variants
- `EventImage` with controlled aspect/fit/overlay behavior
- `StatusBadge`
- `TrustBadge`

System state:

- `LoadingState`
- `EmptyState`
- `ErrorState`
- `DeniedState`
- `UnavailableState`
- `PendingUnknownState`

Operational presentation:

- `AttentionItem`
- `OperationalItem`
- `CredentialFrame` / `AdmissionResult` only as non-authoritative presentation until the relevant backend capability is activated

Do not create redundant large root headers that simply repeat Home / Discover / Events / Feed.

## First checkpoint acceptance bar

The first coded checkpoint must prove all of the following before feature breadth expands:

1. Semantic Classic Ocean token layer.
2. Compact / medium / wide responsive shell behavior.
3. Exact Home / Discover / Events / Feed global roots and no fifth root.
4. Correct top utility placement.
5. Reusable event-card variants, including square compact Events imagery.
6. Event Hub shell over one event projection.
7. Contextual Host Workspace with consumer nav removed.
8. Wide Host Portal shell over the same event/permission projection contract.
9. Representative loading/empty/error/denied/unavailable/pending-unknown states.
10. Light, dark and Classic Ocean rendering.
11. Keyboard/focus behavior on web, non-color-only statuses, dynamic-text/reflow checks and >=44-point-equivalent primary mobile target envelopes.
12. Automated lint/type/build/component checks plus human visual QA on representative phone and wide viewports.

## Backend boundary

The first visual/routing checkpoint can run entirely on deterministic fixtures. This is intentional because there is currently no dedicated Sontu Supabase project and unrelated EL8/Ridgewood infrastructure must not be reused.

When backend work activates, implement against the frozen Core Validation PostgreSQL/Supabase contract. Do not broaden schema merely because a future visual board contains a module.

## Asset boundary

Drive Brand remains the source of truth for design boards and source brand references. Do not copy presentation boards into the repo.

When production assets are needed, export only canonical wordmark/emblem/app-icon assets into a documented versioned asset path. Product chrome is wordmark-first. Emblem is secondary. `Living life, together.` is not persistent screen furniture.
