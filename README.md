# Bridge

An admin-first needs and volunteer outreach portal for **Keystone Family Alliance**, serving Pennsylvania. Caseworkers verify needs, Bridge selects volunteers in small waves, and volunteers claim through secure email links. The public feed is a secondary route at `/?view=feed`.

React 19 + Vite + Tailwind 4, portable PostgreSQL/PostGIS, Supabase Auth and Storage, Resend, and a Node server for Replit. The data module uses `DATABASE_URL` on Replit and AWS; the legacy Supabase data adapter remains available when that variable is absent. Vercel API routes and cron configuration are also included.

## Run the interactive preview

```sh
npm install
npm run dev
```

Open the printed local URL. Demo mode is the default and is prominently labeled. Sample claims, posts, approvals, profiles, and completion state are saved only on the current device. **No emails are sent and no tax acknowledgments are issued in demo mode.** Reset demo clears sample changes.

The default screen is the caseworker dashboard: Overview, Needs pipeline, Email outreach, and Reports. The footer opens the volunteer community feed. Live mode requires staff sign-in before the admin workspace becomes accessible.

## Import into Replit

1. Import this GitHub repository into Replit. `.replit` sets up the development command and port.
2. Run `npm install`, then press Run. The admin demo opens immediately.
3. For a deployed demo, use build command `npm run build` and run command `npm run start`. The Node server serves the built frontend and `/api/*` together. Do not use the Vite development server as a production server.
4. Follow [the live setup guide](docs/SETUP.md) when ready to connect real data, invite staff, and enable email. Keep secret values in Replit Secrets.

For live data, add Replit Database and run `npm run db:migrate`. Replit provides `DATABASE_URL` automatically. The same application data module and migrations can later target AWS RDS PostgreSQL by changing that variable.

Changing `VITE_*` values requires rebuilding the frontend. Setting `VITE_DATA_MODE=live` makes configuration errors visible; live mode never silently substitutes sample data.

## What is implemented

- Admin overview, pending approval, Open → Claimed → Completed pipeline, scoped volunteer contact details, match reasons, delivery activity, volunteer invitations, manual reminders and automatic reminders after 48 hours.
- Secondary verified feed with category, urgency, county, search, distance and sorting controls; My help; optional volunteer profiles and approximate browser location.
- Email verification without volunteer accounts/passwords. New claim requests use 20-minute, single-use links. Matched email links use 72-hour, recipient-bound tokens and an explicit confirmation action to avoid email scanners claiming needs. Returning volunteers can claim in one tap with an HttpOnly session cookie.
- Atomic database claims, organization-scoped foreign keys, staff memberships, RLS, private household records, server-only privileged RPCs, rate limits, input validation, and origin checks.
- PostGIS distance, capability tags, availability windows, completed-category history, need recency, and notification recency throttle in scored matches.
- Staged outreach: 3 matches initially, then 6, 9, etc., with each incremental wave capped at 30. Urgent widens after 15 minutes, soon after 4 hours, flexible after 24 hours. Outreach stops when all requested units are committed and resumes when unprovided commitments are released.
- Per-volunteer rolling-day delivery caps, opt-in email preferences, daily digests, database queue leases, bounded retries, and Resend idempotency keys. Claim confirmations are transactional and excluded from match/reminder caps.
- Quantity-based fulfillment: multiple givers can provide portions of a need. Volunteer delivery reports await staff confirmation; only confirmed quantities complete the need. Completion emails go to the posting social worker.
- Public town/meeting-point location and posting identity on needs, plus specific photo attachments reviewed before volunteers can see them.
- Filterable giving and fulfillment reports with CSV exports, donor receipt emails, and automatic prior-year donor statements from January 1 (Eastern time), through the scheduled worker.
- Recorded contribution acknowledgments for actually received funds or goods, gated on a configured organization EIN. No invented value for goods, volunteer time, or unfulfilled pledges.
- Pine/clay/paper branding, locally bundled Fraunces and Figtree fonts, responsive layouts, keyboard dialogs, screen-reader labels, and light/dark preferences.

## Validation

```sh
npm test
npm run build
```

Database integration tests require a fresh, disposable PostGIS database whose name begins with `sheaf_test_`. They refuse to run against other names or an initialized Bridge schema.

```sh
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/sheaf_test_run npm run test:db
```

See [architecture and operational limits](docs/ARCHITECTURE.md). Hosted Supabase Auth and actual Resend delivery need verification with the organization’s configured services before launch.

## Scope

One deployed organization, with organization settings and organization-scoped data so another foster/adoptive nonprofit can use a separate installation later. There is no multi-organization network, domain management, event system, mission system, team management, or broadcast action. Pennsylvania’s county options are centralized in `src/counties.ts`; other deployments can replace that service-area list and organization seed.

SMS is intentionally not enabled: Twilio was optional. Funds are pledges followed up by a caseworker; there is no payment collection.
