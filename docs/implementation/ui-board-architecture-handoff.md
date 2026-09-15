# Sontu UI Board Architecture Handoff

Source authority: Sontu Drive UI board set created 2026-09-15, plus `02.02.01 Sontu Experience Architecture & UX Requirements`.

## Applied in this branch

- Updated shared design tokens to reflect the new board direction: warm neutral app background, soft elevated surfaces, teal primary action, and coral/sun/moss/lilac support accents.
- Kept radii restrained at 8/12/16px so controls and repeated cards remain operational rather than decorative.
- Preserved the founder-approved consumer shell architecture: Home, Discover, Events, Feed.
- Added Supabase telemetry allowance for UI-board and architecture-validation events so prototype testing can distinguish board/style validation from generic route views.

## Architecture mapping

- Home should answer what matters to the user right now: next event, invitations/changes, credential readiness, and contextual host status.
- Discover should remain the deliberate exploration surface: search, nearby/manual location, categories, and low-supply empty states.
- Events should remain the chronological relationship hub: attending/registered, invited, interested/saved, and hosted events with clear labels.
- Feed should remain event-centered attention before, during, and after events, not a general personal social timeline.
- Hosting should stay contextual from hosted event cards/details, Home when justified, profile/menu entries, and event workspaces.

## Next implementation unit

When editing from a normal checkout, apply the board composition to `apps/web/src/App.tsx` and `apps/web/src/style.css` with build/test verification. The first safe screen pass should be:

1. Rework Home from marketing/exploration to action-and-relevance modules.
2. Keep Discover visually rich but supply-aware.
3. Add Feed placeholder cards that model event-centered updates without enabling generic posting.
4. Add telemetry calls for the new event names when users view or interact with these prototype modules.
5. Run `npm run check` and browser visual QA before merging.
