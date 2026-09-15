# Discover Next Slice Handoff

Status: PLANNING ONLY while PR #5 browser verification is pending.

## Authority

Use `02.02.01 Sontu Experience Architecture & UX Requirements` and the implementation README as the controlling authority. Generated board pixels are reference material only. Written UX requirements and founder corrections control conflicts.

Consumer roots remain exactly Home, Discover, Events, and Feed. Discover answers: "What else could I do?" Events remains the signed-in relationship hub. Feed remains event-centered attention, not a personal timeline.

## Recommendation

Implement Discover next, after PR #5 is green.

Why Discover before Events:

- It is the next root in the consumer vertical slice after Home.
- It validates exploration, low-supply states, filters, categories, nearby presentation, and event-card density without requiring new backend authority.
- Events already has more account/domain coupling, so it is better handled after the route/shell and Discover patterns are stable.

## Dependencies

Must wait for PR #5:

- Home and Feed route-native rendering must pass browser verification.
- Shell scroll behavior, root gestures, one-main landmark behavior, and mobile overflow must be stable.
- Do not add another overlay, parallel route surface, or global root.

Can be prepared before PR #5 is green:

- Copy, state definitions, visual mapping, acceptance checklist, and test intent.
- No broad implementation changes.
- No unrelated Supabase changes.

## KEEP

- Keep Discover as a root tab, not a sub-mode of Home or Events.
- Keep the existing search field and Explore/Nearby mode switch.
- Keep real event data as the source for event cards.
- Keep empty/loading/error states explicit and honest about beta supply.
- Keep `filter-row` and `discover-feature` as stable gesture-test anchors, but make them part of real markup rather than runtime DOM shims.
- Keep host management out of Discover except as event-card context where relevant.

## CHANGE

- Change Discover from a basic list/search surface into a structured exploration board.
- Change Nearby from a placeholder panel into a clear beta-state presentation that can later accept location-aware results.
- Change event-card layout to support compact/mobile scanability and wider responsive browsing.
- Change category/filter presentation to use semantic UI primitives rather than mockup-specific decorative controls.
- Change copy so Discover is about possibility and exploration, not personal commitments.

## ADD

- Add a top exploration band with Search, Explore/Nearby segmented controls, and a small beta-supply/status note.
- Add category chips for broad event intent, backed initially by client-side filtering if no stronger backend category authority exists.
- Add a nearby beta panel that clearly states what is available now and what is not active yet.
- Add a recommended/available events section using existing published events.
- Add an empty state for no discoverable events and a separate empty state for no query matches.
- Add responsive acceptance cases for compact, medium, and wide layouts.
- Add accessibility acceptance for landmark count, visible focus, contrast, button names, and no horizontal overflow.

## REMOVE / AVOID

- Do not add a fifth root such as Saved, Host, Create, Messages, Inbox, Profile, or Me.
- Do not turn Discover into the Events relationship hub.
- Do not put Create Event as the primary Discover job.
- Do not present Feed-like social updates in Discover.
- Do not claim real location-aware discovery until it is implemented.
- Do not introduce persona-specific separate apps or mutually exclusive modes.
- Do not copy generated mockup pixels literally when they conflict with written authority.

## Acceptance Checklist

Functional:

- `/discover` renders as a first-class routed screen inside the existing app shell.
- Search filters published discoverable events by title and venue text.
- Explore/Nearby controls are buttons with accessible names and selected state.
- Nearby has an honest beta state if live location-aware discovery is unavailable.
- Empty states distinguish no supply from no search matches.
- Event cards link to the appropriate event hub/relationship route already used by the app.

Architecture:

- One visible `main#main` landmark per route.
- No portal or overlay replacement for route content.
- No new global root navigation item.
- No new Supabase migration unless a real schema-backed Discover field is intentionally introduced.
- Telemetry, if added, must use existing allowed beta event names or be paired with a matching migration/constraint update.

Visual/UI:

- Uses semantic design tokens only.
- Works at compact, medium, and wide widths without horizontal overflow.
- Preserves Sontu's warm/productive event-exploration tone without marketing-page hero treatment.
- Uses familiar controls: search input, segmented mode controls, chips, event cards, and status/empty states.

Verification:

- `npm run check` passes.
- Production build passes against isolated backend.
- Playwright shell/gesture/accessibility tests pass.
- Human visual review checks phone and wide viewport.

## Suggested First Implementation Unit

After PR #5 is green, make a narrow Discover-only PR:

1. Refine the `/discover` route markup and copy.
2. Add category chips and honest Nearby beta state using existing data.
3. Preserve current tests and add only targeted assertions for Discover states.
4. Avoid changing Home, Feed, Events, Supabase, or shell behavior unless the tests reveal a direct dependency.
