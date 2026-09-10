# Validation performed

Validated locally on September 10, 2026:

- Production TypeScript/Vite build and portable Node server bundle.
- 18 unit/contract tests: opaque tokens, session parsing and cookie flags, origin rejection, cron secret comparison, email escaping, signed email claims, input validation, matching reasons, contribution acknowledgments, and optional WebMCP navigation contracts.
- 26 PostgreSQL 17/PostGIS integration checks in a fresh isolated database: RLS/column grants, staff organization boundaries, privileged RPC access, unapproved/invalid/cross-organization claims, simultaneous claim races, repeat-claim idempotency, approval/completion transitions, expired/reused/lost-claim links, real geographic distances, match history, atomic rate limits, first/later notification waves, cancellation on claim, digest grouping, delivery caps, automatic reminder deduplication, availability exclusions, concurrent worker leases, and recovery after a final-attempt worker crash.
- Production server HTTP checks: admin and feed entry routes return 200; unconfigured live API returns 503; unauthenticated cron returns 401; source/secret paths return 404; malformed JSON returns 400; security headers present.
- npm audit reported zero known dependency vulnerabilities after the test runner update and removal of the unnecessary Vercel tooling dependency.

Not yet validated: hosted Supabase Auth redirects/SMTP, actual Resend delivery, organization EIN/contact setup, Replit deployment, scheduled execution on the chosen hosting plan, real WebMCP browser support, or browser interaction/visual QA. No real volunteers were emailed and no live family records were created.
