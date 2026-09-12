# Host presence and explicit beta feedback

Founder correction: the event host belongs in the Going participant presentation with a Host badge. The authorized Host Workspace includes the current owner once and Going includes that host for published SIMPLE events. A matching self-invitation is deduplicated in this presentation. Hosting remains an event permission, not an account type. This does not create a self-invitation, change guest capacity allocation or generate reconfirmation obligations for the owner.

The floating + / Dev note control is an explicitly requested beta feedback utility above the consumer bottom navigation and available in focused workspaces/drawers. It is not event creation or a fifth global root. Its text/accessible label make that distinction clear. Keep the four consumer roots unchanged.

Notes are deliberately submitted to public.sontu_dev_notes, with author-only SELECT/INSERT under RLS. No client UPDATE/DELETE or anonymous grants. Store the author ID, created time, free-text note and a constrained screen category; do not capture raw routes, event IDs, invitation tokens, screenshots or activity. Note content is user-entered and should not include passwords. Signed-out users can copy their note into chat. The recent-notes view reads the author's saved records. Duplicate retries retain a UUID and verify the saved record before success.

Existing diagnostic categories remain bounded and session-local; no remote telemetry or session replay is added. Saved dev notes can be read during a subsequent authorized development pass; they do not push messages into the assistant's conversation or start background work.
