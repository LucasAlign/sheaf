import { config, database, result, one } from "../server/db";
import { HttpError, type Request, type Response } from "../server/http";
import {
  constantEqual,
  escapeHtml,
  emailClaimToken,
  emailSigningSecret,
  hashToken,
} from "../server/security";
import { emailTemplate, sendEmail } from "../server/email";
import { deliverRecordEmail } from "../server/recordEmails";
export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const stagingRun =
    process.env.BRIDGE_EMAIL_TRANSPORT === "capture" &&
    process.env.NODE_ENV !== "production" &&
    req.headers["x-bridge-staging-run"] === "capture";
  const secret =
    process.env.CRON_SECRET ||
    (process.env.BRIDGE_EMAIL_TRANSPORT === "capture" &&
    process.env.NODE_ENV !== "production"
      ? process.env.SESSION_SECRET
      : undefined);
  if (
    !stagingRun &&
    !secret ||
    (!stagingRun &&
      !constantEqual(req.headers.authorization || "", `Bearer ${secret}`))
  )
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const c = config();
    const db = database();
    // Expired tokens are not retained indefinitely. No volunteer PII is logged.
    await result(
      db
        .from("volunteer_sessions")
        .delete()
        .lt("expires_at", new Date().toISOString()),
    );
    await result(
      db
        .from("magic_links")
        .delete()
        .lt("expires_at", new Date().toISOString()),
    );
    await result(
      db
        .from("rate_limits")
        .delete()
        .lt("window_start", new Date(Date.now() - 86400000).toISOString()),
    );
    await result(db.rpc("refresh_matches", { p_org: c.org }));
    const queued = await result(db.rpc("prepare_waves", { p_org: c.org }));
    await result(db.rpc("prepare_reminders", { p_org: c.org }));
    const easternYear = Number(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        timeZone: "America/New_York",
      }).format(new Date()),
    );
    await result(
      db.rpc("prepare_annual_statements", {
        p_org: c.org,
        p_year: easternYear - 1,
      }),
    );
    const notifications = await result(
      db.rpc("reserve_notifications", { p_org: c.org }),
    );
    const org = await one(
      db
        .from("organizations")
        .select("name,contact_email")
        .eq("id", c.org)
        .single(),
    );
    let delivered = 0,
      failed = 0;
    for (const notification of notifications || []) {
      try {
        const allowed = await result(
          db.rpc("delivery_allowed", { p_org: c.org, p_id: notification.id }),
        );
        if (!allowed) {
          await result(
            db
              .from("notifications")
              .update({ status: "cancelled" })
              .eq("organization_id", c.org)
              .eq("id", notification.id),
          );
          continue;
        }
        if (await deliverRecordEmail(db, c.org, c.appUrl, notification)) {
          await result(
            db
              .from("notifications")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                lease_until: null,
                last_error: null,
              })
              .eq("organization_id", c.org)
              .eq("id", notification.id),
          );
          delivered++;
          continue;
        }
        const v = await one(
          db
            .from("volunteers")
            .select("name,email,frequency")
            .eq("organization_id", c.org)
            .eq("id", notification.volunteer_id)
            .single(),
        );
        const ids = notification.need_id
          ? [notification.need_id]
          : notification.payload.need_ids || [];
        const candidates = await result(
          db
            .from("needs")
            .select(
              "id,title,status,needed_by,ways_to_help,public_location,poster_name,quantity_required,quantity_committed,unit_label",
            )
            .eq("organization_id", c.org)
            .in("id", ids),
        );
        const promotional = ["match", "digest"].includes(notification.kind);
        const needs = (candidates || []).filter((n: any) =>
          promotional
            ? n.status === "open" &&
              Date.parse(n.needed_by) > Date.now()
            : notification.kind === "reminder"
              ? ["open", "claimed"].includes(n.status)
              : ["open", "claimed", "completed"].includes(n.status),
        );
        if (
          !needs.length ||
          (promotional &&
            (v.frequency === "off" ||
              (notification.kind === "digest" && v.frequency !== "digest") ||
              (notification.kind === "match" && v.frequency !== "instant")))
        ) {
          await result(
            db
              .from("notifications")
              .update({ status: "cancelled" })
              .eq("organization_id", c.org)
              .eq("id", notification.id),
          );
          continue;
        }
        if (notification.kind === "reminder") {
          const claim = await result(
            db
              .from("claims")
              .select("quantity,fulfilled_quantity")
              .eq("organization_id", c.org)
              .eq("id", notification.payload.claim_id)
              .maybeSingle(),
          );
          if (!claim || claim.quantity <= claim.fulfilled_quantity) {
            await result(
              db
                .from("notifications")
                .update({ status: "cancelled" })
                .eq("organization_id", c.org)
                .eq("id", notification.id),
            );
            continue;
          }
        }
        const title =
          notification.kind === "claim_confirmation"
            ? "You’re on it. Thank you."
            : notification.kind === "reminder"
              ? "A little check-in on your commitment."
              : notification.kind === "digest"
                ? "Your daily ways to show up."
                : "A need that could use someone like you.";
        const items: string[] = [];
        let firstLink = `${c.appUrl}/?view=feed`;
        for (const [index, n] of needs.entries()) {
          if (promotional) {
            const token = emailClaimToken(
              emailSigningSecret(),
              notification.id,
              n.id,
            );
            const tokenHash = hashToken(token);
            const expires = new Date(
              new Date(notification.created_at).getTime() + 72 * 3600000,
            ).toISOString();
            // Stable signed material means retries have identical links and Resend bodies.
            // Persist only the hash; duplicate retries never extend an existing token.
            await result(
              db.from("magic_links").upsert(
                {
                  token_hash: tokenHash,
                  organization_id: c.org,
                  email: v.email,
                  name: v.name,
                  need_id: n.id,
                  way: n.ways_to_help[0],
                  expires_at: expires,
                },
                { onConflict: "token_hash", ignoreDuplicates: true },
              ),
            );
            const link = `${c.appUrl}/?view=feed#token=${token}&need=${n.id}`;
            if (index === 0) firstLink = link;
            items.push(
              `<li><strong>${escapeHtml(n.title)}</strong><br>${escapeHtml(n.public_location || "")} · Posted by ${escapeHtml(n.poster_name || org.name)}<br>${n.quantity_required - n.quantity_committed} ${escapeHtml(n.unit_label)} available · ${escapeHtml(n.ways_to_help[0])} · <a href="${escapeHtml(link)}">I can help</a></li>`,
            );
          } else items.push(`<li>${escapeHtml(n.title)}</li>`);
        }
        const body = `<p>Hi ${escapeHtml(v.name)},</p><ul>${items.join("")}</ul>${promotional ? "<p>These needs fit your profile. Follow a secure link and confirm your help—no account or password needed. A need may be claimed before you arrive.</p>" : `<p>Your caseworker can coordinate next steps at ${escapeHtml(org.contact_email)}.</p>`}`;
        await sendEmail(
          db,
          c.org,
          v.email,
          `${org.name}: ${title}`,
          emailTemplate(
            org.name,
            title,
            body,
            firstLink,
            promotional ? "Review & confirm my help" : "Open Bridge",
          ),
          notification.id,
        );
        await result(
          db
            .from("notifications")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              lease_until: null,
              last_error: null,
            })
            .eq("organization_id", c.org)
            .eq("id", notification.id),
        );
        delivered++;
      } catch {
        await result(
          db
            .from("notifications")
            .update({
              status: notification.attempts >= 5 ? "failed" : "queued",
              last_error:
                "Delivery failed. Check email configuration or provider status.",
              lease_until: null,
              send_after: new Date(
                Date.now() + Math.min(60, 2 ** notification.attempts) * 60000,
              ).toISOString(),
            })
            .eq("organization_id", c.org)
            .eq("id", notification.id),
        );
        failed++;
      }
    }
    return res.status(200).json({ queued, delivered, failed });
  } catch (e) {
    return res.status(e instanceof HttpError ? e.status : 500).json({
      error:
        e instanceof HttpError ? e.message : "Notification processing failed.",
    });
  }
}
