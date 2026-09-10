# Architecture

## Product boundary

Admin is the primary workspace. Email is the primary volunteer entry point. A secondary, branded public feed remains available for discovery, filters and repeat volunteers. The organization record holds the deployment’s brand and contact settings; each deployment uses exactly one server-configured `SHEAF_ORG_ID`.

## Trust and identity

The browser has only the Supabase public key for staff Auth. Server routes verify staff JWTs with Supabase and consult `organization_members`. No role is taken from client-editable metadata. All application reads and writes are filtered by the configured organization; composite foreign keys reject cross-organization references.

Guest identity uses 32-byte opaque tokens, SHA-256 token hashes in the database, single-use link redemption, and 30-day HttpOnly/SameSite session cookies. Production cookies are Secure. New links are in URL fragments, removed immediately after parsing, so browser requests do not send them as paths or referrers. The confirmation button performs a same-origin POST; GET requests never claim a need. Email providers and security scanners can safely follow links without fulfilling them.

The database locks a need during a claim and maintains a unique claim per need. Losing concurrent claims roll back atomically. Link consumption, volunteer upsert, optional claim and session creation share one transaction. A repeated claim by its owner is idempotent. RLS and column grants deny public access to volunteer contact information, household records, exact coordinates and token tables. Privileged RPCs are executable only by the server service role.

Public service locations should be town centers or public meeting points. Approximate volunteer geolocation is rounded to two decimals in the browser and retained only for matching. The public API never returns another volunteer’s location or identity.

## Matching

`score_matches` calculates on open, approved, unexpired needs:

| Component | Contribution |
| --- | --- |
| PostGIS straight-line distance | Up to 30, linearly declining to 0 at 60 miles |
| Capability overlap | 35 |
| Availability contains the full service window | 20 |
| Completed needs in the same category | 5 each, capped at 10 |
| Need recency | Up to 5 |
| Recent matched/digest invitations | Minus 3 each, capped at 15 |

Reasons describe only factors actually present. Missing coordinates never invent a distance. Before outreach, candidates must have a compatible capability, a score of at least 20, compatible supplied availability, an enabled email preference and remaining cap. Known distances over 60 miles are excluded except for funds. Missing availability/location does not disqualify a volunteer; the caseworker still coordinates suitability. Scores are prioritization aids, not verification of driving clearance or household access.

## Waterfall and delivery

Each due need is locked while selecting an incremental wave. Volunteer rows are locked while allocating frequency budgets. Digest needs are grouped into one queued email. Claims cancel queued match messages; the sender rechecks status before dispatch. Messages use leases and bounded retries; Resend keys deduplicate retry attempts. Recency throttling includes queued/sending/sent invitations, so a volunteer is not repeatedly selected simply because delivery is delayed.

The initial wave is 3; later waves expand to 6, 9, 12, up to 30 additional recipients per wave. Critical needs widen every 15 minutes, soon needs every 4 hours, flexible needs every 24 hours. There is no broadcast API. A five-minute worker means a wave can begin up to five minutes after its intended time. Urgent matching still respects digests and opt-outs.

Transactional claim confirmations bypass match/reminder caps. Manual and automatic reminders consume the same daily budget as matched emails. A failed email has an explicit status and five-attempt ceiling. Provider outages require operational attention; the application does not silently switch to SMS or broadcast.

## Operational limits

- Browser state is demo-only or preferences-only. Live needs and claims are durable in PostgreSQL.
- Feed and admin queries currently return up to 1,000 needs. This MVP is intended for a bounded active workload; add server pagination and archival policies before exceeding that size.
- Match refresh computes organization-wide candidate pairs. Add geographic preselection and incremental refresh if the volunteer population makes full refresh expensive.
- Each worker run plans at most 30 due needs and dispatches at most 30 emails. Tune worker capacity and queue metrics as real volume becomes known.
- An email already accepted by the provider cannot be recalled if a need is claimed milliseconds later. Landing confirmation checks availability atomically and explains that the need has been claimed.
- Replit needs the portable Node server and an external schedule or always-on VM. Vercel needs a plan supporting five-minute schedules. Supabase Auth SMTP and Resend domain setup are external prerequisites.
- No payments are collected. Contribution acknowledgments represent staff-recorded receipts, not pledges or donated time. The organization must configure its EIN and determine whether a gift may be acknowledged.
- Staff approval can be performed by the posting caseworker. Two-person review can be added if the organization requires it.
- No SMS or multi-organization administration is included. Another nonprofit uses a separate deployment and replaces the seed/service-area configuration.
- An optional, feature-detected WebMCP tool can open an accessible need’s details; it cannot approve, claim, or send mail. Its registration and input contract are unit-tested, but support in a real WebMCP browser has not been verified. Browser interaction/visual QA was not run.
