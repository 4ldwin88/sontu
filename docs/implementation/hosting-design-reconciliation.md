# Hosting design reconciliation — September 12

Status: confirmed composition drift; copied-link live failure unresolved.

## Evidence

Reviewed repository b6d5d3dee0c43cb6e1321db5d47592aeac75a383, current UX sections 29–30, current Technology invitation-policy resolution, Product Foundation, Domain & System Behavior, User Journeys, Validation Roadmap, and Governance. Earlier holds are historical where later founder session instructions explicitly authorize implementation.

Visually inspected the Drive Mobile Host Workspace Flow (file 1K_OSGJnGNQuSWG9i226Pb2Q6c1oWL5qE), One Platform Every Event / progressive portal board (1JHpaQwPhrZxtUo5sS2jVspuAdCptCVss), and Design System / Responsive Showcase (1XLGLA5TngrdpRybhvkFRDlAYlaxJ22vu). Other recent Brand boards were surveyed in a contact sheet; no presentation boards were added to runtime assets.

## Confirmed mismatches and corrective direction

- Compact overview: reference prioritizes Event Status, compact Key Stats, then Next Up. Implemented connected overview stacks large guest summary, event details, reconfirmation and delivery panels. Restore the reference hierarchy using real lifecycle/attention and guest counts, without fabricated On track, check-in or page-view metrics.
- Wide portal: reference uses an event banner, compact metric row, grouped quick actions and secondary panes. Current connected shell retains a utilitarian identity row and large generic panels. Restore composition while preserving the same permission/state contract.
- Simple-event scope: inactive reconfirmation and simulated delivery concepts occupy routine overview space. Move secondary detail behind relevant context; show actionable material-change attention when applicable. Do not add Team, To Do, Resources, Admission or Analytics merely because boards show them.
- Preserve exact consumer roots and their disappearance in focused hosting. Preserve square compact identity imagery, wordmark usage and semantic Classic Ocean tokens. Reject generated navigation/token/policy drift.

## Invitation failure: evidence boundary

Host-generated URLs use browser origin + pathname + hash invitation token. Local browser checks passed named-recipient access and account-return flows, but did not establish live copied-link usability through Sites owner-only access. Current technical authority explicitly conditions external invitation activation on verified email delivery and permitted hosting access. Hosted OTP remains disabled, and accountless verification therefore remains unavailable on the deployed beta.

Do not infer the founder's failure is hosting access, incorrect recipient account, malformed URL, expiry/revocation, or authentication without the actual failing screen/URL shape. Request a screenshot of what appears after opening the copied link; do not request a password or expose private invitation tokens in logs/reports. No access controls were changed and no live-link fix is claimed.

## Next acceptance evidence

Compare compact and wide connected host screenshots directly with the cited boards. For links, verify the actual generated URL in the intended live access context, then exercise matching and wrong recipient sessions. Keep isolated CI evidence separate from live-site evidence.
