# Live setup for Keystone Family Alliance

## 1. Supabase

Create a dedicated project. Run these files, in order, in the SQL editor (or apply with the Supabase CLI):

1. `supabase/migrations/202609100001_sheaf.sql`
2. `supabase/migrations/202609100002_delivery.sql`
3. `supabase/migrations/202609100003_reminders.sql`
4. `supabase/migrations/202609100004_fulfillment_reports.sql`
5. `supabase/migrations/202609100005_photos.sql`
6. `supabase/seed.sql`, after replacing the placeholder caseworker contact email.

For an existing installation with migrations 001–003 applied, apply only 004 and 005; do not rerun the initial schema or seed. Migration 005 creates the private `need-photos` Storage bucket (5 MB, JPEG/PNG/WebP).

The migration enables PostGIS in `extensions`. Use a dedicated database/project; the initial grants deliberately close direct client writes to Sheaf tables. If an existing project has PostGIS in another schema, adapt the extension schema explicitly before migration.

The seed creates Keystone Family Alliance only, with no real family data and no invented needs. Organization ID: `c3206037-3638-4263-b18d-813a5895f1c8`.

Invite the first staff user through Supabase Auth. Add their actual Auth user UUID to `organization_members` using the commented example in the seed file. No signup form can grant caseworker access. All staff can approve; self-approval is allowed in this MVP, while `created_by` and `approved_by` remain recorded.

Configure Supabase Auth’s site URL and allowed redirects to your exact deployment origin. Configure production SMTP (Resend SMTP may be used) for staff magic links. Volunteer links use Sheaf’s Resend integration independently of Supabase Auth. There is no requirement to enable anonymous Supabase Auth users.

Update the organization’s real `contact_email` and verified `ein` before issuing contribution acknowledgments. The frontend reads the public name and service area from this record.

## 2. Replit Secrets

Copy names from `.env.example`; enter values in Replit Secrets, not Git or chat:

| Variable | Value |
| --- | --- |
| `VITE_DATA_MODE` | `live` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (safe to include in frontend) |
| `SUPABASE_URL` | Same Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key |
| `SHEAF_ORG_ID` | Organization UUID from the seed |
| `APP_URL` | Exact public HTTPS origin, without a trailing slash |
| `RESEND_API_KEY` | Resend server API key |
| `EMAIL_FROM` | Keystone Family Alliance &lt;care@your-verified-domain.org&gt; |
| `CRON_SECRET` | A cryptographically random secret of at least 32 characters |
| `LINK_SIGNING_SECRET` | A different cryptographically random secret of at least 32 characters |

Generate independent random secrets locally, for example with Node’s `crypto.randomBytes(32).toString('hex')`. Rotating `LINK_SIGNING_SECRET` changes future email link derivations; already-issued hashed tokens remain valid until expiration.

Verify your sending domain in Resend. Claims and invitations fail visibly if email delivery is not configured; they do not pretend a message was sent. Keep production email settings separate from demo environments.

Build with `npm run build`, start with `npm run start`. The server listens on `PORT` or 5173 and binds to `0.0.0.0`.

## 3. Schedule outreach

The notification worker must run every five minutes. Choose **one** option:

- **Replit Autoscale:** create a scheduled deployment/job running `node scripts/run-notifications.mjs` every five minutes, with `APP_URL` and `CRON_SECRET`. Alternatively use a scheduler that makes `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>`. Do not put the secret in the URL.
- **Replit Reserved VM:** set `SHEAF_RUN_SCHEDULER=true`. The portable server runs a guarded five-minute timer. Leave this off on Autoscale, where the process can sleep.
- **Vercel:** the supplied `vercel.json` registers the five-minute cron. Configure `CRON_SECRET` and use a plan that supports the required frequency.

The cron refreshes matches, plans due waves, queues reminders for claims older than 48 hours, reserves due messages, checks current preferences and claim state, then sends through Resend. Match/digest/reminder email caps are enforced at queue and delivery time. Reminders are deduplicated by claim/day and each giver’s commitment must be at least 48 hours old for an automatic reminder. Digest delivery is at 9 a.m. Eastern the next day, independent of UTC daylight-saving shifts.

The same worker sends receipts for staff-recorded donations and completion notices to the Auth email of the social worker who posted the need. From January 1, it generates and emails the prior calendar year’s donor statements automatically. Unchanged statements are not sent again; late-recorded prior-year gifts produce a revised statement. Staff can also generate a selected completed year under Reports. Transactional receipts, statements, and completion emails do not consume matching frequency caps.

Email failures are retried at bounded intervals up to five attempts. Inspect the admin outreach failure count and `notifications.last_error` if delivery stalls. Provider errors are deliberately summarized to avoid leaking sensitive information.

## 4. First real workflow

1. Sign in as the invited caseworker; confirm an unapproved account cannot access the workspace.
2. Invite one consenting volunteer using their real email address.
3. Have them confirm their email, save capabilities/location/availability, and opt into individual matches or a digest. New profiles default to no match emails until the volunteer chooses.
4. Post a nonsensitive test need with a public meeting-point location and approve it. Never post family names, addresses, case notes, or identifying details.
5. Run the scheduled job once, verify the branded email, follow its secure link, and confirm the claim. The portal must show the need as claimed and the caseworker must see the volunteer contact.
6. Have the volunteer report delivery, then confirm the actual received quantity as staff. Test a three-dresser need with two received: release any unprovided commitment and verify one remains available. Completing the last unit must queue an email to the posting social worker.
7. For an actual eligible gift, confirm donation details and record the receipt; verify the giver receives the email and text attachment. Check Reports → Giving report and export the CSV. Test a completed-year donor statement with approved test records.
8. Attach a nonsensitive specific photo, approve it, and check that volunteers receive only the approved image.
9. Verify unsubscribe preferences, link expiration, and the organization contact email before introducing real family needs.

No actual email delivery, external authentication, or hosted deployment has been performed just by importing the source.

## Reference choices

- Pennsylvania lists [67 counties](https://www.pa.gov/agencies/dli/resources/statistic-materials/products/county-profiles); all are available in the service-area picker. This is geographic support, not a claim that Keystone has an active chapter in every county.
- Resend supports [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) for retries.
- Vercel documents [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs) with `CRON_SECRET`.
- Replit supports [scheduled deployments](https://replit.com/blog/scheduled-deployments) for background jobs; an Autoscale site can [scale down when idle](https://replit.com/blog/autoscale), so it should not depend on an in-process timer.
- Contribution wording follows the IRS’s [written acknowledgment elements](https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-contributions-written-acknowledgments). This MVP records only gifts for which no goods or services were provided in exchange; it does not determine tax deductibility.
