# Sontu Implementation Preparation

Status: ACTIVE CONNECTED IMPLEMENTATION

Drive remains the authority for intended product/domain/design behavior.
Repository code is implemented behavior; deployed authenticated surfaces are
observed behavior. The September 12 Core Validation checkpoint is preserved as
historical evidence. Later founder direction authorizes admissions, private
commerce-state foundations, real operational analytics and bounded assistance as
described in `hosting-design-reconciliation.md`; that later direction controls
any conflict.

## Current design authority

Implementation must consume the September 12, 2026 Sontu Design Authority Reconciliation & Implementation Lock in `02.02.01 Sontu Experience Architecture & UX Requirements`, especially sections 25–30.

Do not infer product behavior directly from generated mockup pixels. Brand-folder images are visual references and include known drift. Written authority and founder corrections control conflicts.

## Locked mobile shell

Consumer roots are exactly:

- Home
- Discover
- Events
- Feed

No global Create/+ / Host / Messages / Inbox / Saved / Profile / Me root may be added.

Profile/avatar is a top utility. Search and Notifications are top utilities where the root shell applies. Host management is contextual beneath hosted events. The global consumer nav disappears inside the focused Mobile Host Workspace.

## Surface families

1. Consumer mobile shell — Home / Discover / Events / Feed.
2. Event Hub — one event identity adapted to relationship/context/permissions.
3. Event creation — intent-first, progressively disclosed.
4. Mobile Host Workspace — compact/in-field event operations.
5. Host Portal — responsive wide-screen deeper operations.
6. Role-specific operational surfaces — Admission/Check-in, Staff/Volunteer, Event Manager and other evidence-earned roles.
7. Public/accountless event representation where allowed.
8. Onboarding, preferences, appearance and system states.

## Progressive complexity

Simple events remain simple. Wedding/private-complex and enterprise/conference capability families compose onto the same event model only when activated. Team & Roles, lightweight event-scoped To Do, Resources/Equipment & Materials, operational attention and role/station assignment are permitted. Sontu must not become a general project-management/ERP/CRM system.

## Brand and design system

Primary product brand presence is the Sontu wordmark. The emblem is secondary/reserved for app icon, favicon, apparel/merchandise and compact emblem-appropriate uses.

Tagline: `Living life, together.` Do not stamp it redundantly into normal product screens.

Classic Ocean anchors:

- Ocean Light `#38BDF8`
- Ocean `#0EA5E9`
- Ocean Deep `#2563EB`
- Navy `#0F2D5B`

All component styling must resolve through semantic tokens. Semantic success/warning/error/destructive/access meanings do not change with cosmetic themes.

## Personalization

Explorer, Nearby/Spontaneous, Connector and Planner/Participant are non-exclusive weighted tendencies. They change ranking/emphasis/density/default presentation, not navigation, permissions or event truth. Do not build four separate applications or mutually exclusive personas.

## Implementation sequence

### Foundation
- App/workspace structure and build tooling.
- Semantic design tokens and appearance/theme layer.
- Responsive layout primitives: compact / medium / wide.
- Typography, icon, action, input, card/list, status and system-state primitives.
- Route/state architecture with stable consumer roots and contextual workspaces.
- Accessibility baseline from first component implementation.

### Consumer vertical slice
- Root shell.
- Home.
- Discover including Nearby presentation.
- Events: Upcoming / Invited / Interested / Hosting.
- Event-only Feed.
- Event Hub.
- Credential/ticket.

### Creation and host vertical slice
- Intent-first simple event creation.
- Mobile Host Workspace.
- Host Portal baseline.
- Team & Roles.
- Event-scoped To Do and Resources.
- Participants/commitments and communications as domain scope permits.

### Event-day operations
- Admission home.
- Scan/manual lookup.
- Valid / already-used / invalid / unresolved states.
- Explicit X/Close on transient scan-result screens plus Scan Next.
- Staff/Volunteer assigned workspace.
- Event Manager compact view.
- Degraded connectivity only to the authority actually implemented; never invent offline admission authority.

### Personalization and hardening
- Behavioral preference onboarding.
- Interests/location/notifications where stage-approved.
- System / Light / Dark and curated token-based accents.
- Loading/empty/error/denial/unavailable/pending states.
- Accessibility, dynamic text, focus and responsive QA.

## State architecture

UI state should not be encoded as page-specific ad hoc booleans. Components consume explicit semantic states. Consequential state such as payment, entitlement, permission, publication, cancellation and check-in must come from authoritative domain/backend state rather than optimistic visual assumptions.

## Reference-image rule

Brand-folder boards should be used as a reference catalog, not copied literally. Known rejected patterns include:

- any fifth global root;
- generic personal/social Feed;
- discovery controls replacing Events;
- permanent one-of-four personas;
- persistent wordmark/tagline footer branding;
- routine emblem+wordmark product chrome;
- desktop Host Portal squeezed into phone width;
- generic PM/ERP/CRM expansion;
- unvalidated offline admission authority;
- generated token/policy/WCAG claims treated as facts.

## First coded checkpoint

The first implementation checkpoint should prove the design system and routing before feature breadth:

1. semantic token layer;
2. responsive shell;
3. exact Home / Discover / Events / Feed navigation;
4. Event card variants and square compact Events imagery;
5. Event Hub shell;
6. focused Host Workspace shell with global nav removed;
7. representative loading/empty/error states;
8. light/dark/Classic Ocean rendering;
9. automated checks plus human visual review on phone and wide viewport.

Do not begin by implementing every mockup screen independently. Build the shared component/state system first so adaptive presentation and host/participant surfaces remain one coherent product.
