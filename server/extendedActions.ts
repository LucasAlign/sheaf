import { randomUUID } from "node:crypto";
import { z } from "zod";
import { result, one, type DB } from "./db";
import { HttpError, type Response } from "./http";
import {
  contributionSchema,
  confirmSchema,
  reportSchema,
  uuid,
  receiptSchema,
} from "./validation";
import { validatePhoto } from "./photos";
import { buildReceipt } from "./receipt";
import { buildAnnualStatement } from "./reports";
import { createPhotoUpload } from "./platform";
type Context = {
  db: DB;
  org: string;
  body: unknown;
  staff: () => string;
  volunteer: () => string;
  isStaff: boolean;
  res: Response;
};
export async function extendedAction(
  action: string,
  { db, org, body, staff, volunteer, isStaff, res }: Context,
): Promise<boolean> {
  const ok = (data: unknown = { ok: true }) => {
    res.status(200).json(data);
    return true;
  };
  if (action === "claim-details") {
    const p = receiptSchema.parse(body);
    let q = db
      .from("claims")
      .select("*")
      .eq("organization_id", org)
      .eq("need_id", p.need_id);
    if (!isStaff) q = q.eq("volunteer_id", volunteer());
    const claims = await result(q.order("created_at"));
    const ids = (claims || []).map((c: any) => c.volunteer_id),
      cids = (claims || []).map((c: any) => c.id);
    const contacts = ids.length
      ? await result(
          db
            .from("volunteers")
            .select("id,name,email")
            .eq("organization_id", org)
            .in("id", ids),
        )
      : [];
    const gifts = cids.length
      ? await result(
          db
            .from("contributions")
            .select("id,claim_id,quantity")
            .eq("organization_id", org)
            .in("claim_id", cids),
        )
      : [];
    return ok({
      claims: (claims || []).map((c: any) => ({
        ...c,
        name: contacts?.find((v: any) => v.id === c.volunteer_id)?.name,
        email: contacts?.find((v: any) => v.id === c.volunteer_id)?.email,
        receipted_quantity: (gifts || [])
          .filter((g: any) => g.claim_id === c.id)
          .reduce((s: number, g: any) => s + g.quantity, 0),
      })),
    });
  }
  if (action === "report-delivery") {
    const p = z
      .object({ claim_id: uuid, quantity: z.number().int().min(1).max(10000) })
      .strict()
      .parse(body);
    await result(
      db.rpc("report_delivery", {
        p_org: org,
        p_claim: p.claim_id,
        p_volunteer: volunteer(),
        p_quantity: p.quantity,
      }),
    );
    return ok();
  }
  if (action === "confirm-delivery") {
    const p = confirmSchema.parse(body);
    await result(
      db.rpc("confirm_delivery", {
        p_org: org,
        p_claim: p.claim_id,
        p_user: staff(),
        p_quantity: p.quantity,
        p_release: p.release_remainder,
        p_gift: p.gift || null,
      }),
    );
    return ok();
  }
  if (action === "update-quantity") {
    const p = z
      .object({ need_id: uuid, quantity: z.number().int().min(1).max(10000) })
      .strict()
      .parse(body);
    await result(
      db.rpc("update_need_quantity", {
        p_org: org,
        p_need: p.need_id,
        p_user: staff(),
        p_quantity: p.quantity,
      }),
    );
    return ok();
  }
  if (action === "contribution") {
    const p = contributionSchema.parse(body);
    const id = await result(
      db.rpc("record_contribution", {
        p_org: org,
        p_claim: p.claim_id,
        p_user: staff(),
        p_gift: p.gift,
      }),
    );
    return ok({ id });
  }
  if (action === "receipt") {
    const p = z.object({ claim_id: uuid }).strict().parse(body);
    const c = await one(
      db
        .from("claims")
        .select("id,volunteer_id,need_id")
        .eq("organization_id", org)
        .eq("id", p.claim_id)
        .single(),
    );
    if (!isStaff && c.volunteer_id !== volunteer())
      throw new HttpError(404, "Receipt not found.");
    const gifts = await result(
      db
        .from("contributions")
        .select("*")
        .eq("organization_id", org)
        .eq("claim_id", c.id)
        .order("received_at"),
    );
    if (!gifts?.length)
      throw new HttpError(
        404,
        "No received contribution has been recorded for this claim.",
      );
    const o = await one(
      db
        .from("organizations")
        .select("name,ein,contact_email")
        .eq("id", org)
        .single(),
    );
    if (!o.ein)
      throw new HttpError(
        409,
        "Configure the organization EIN before issuing receipts.",
      );
    const v = await one(
      db
        .from("volunteers")
        .select("name")
        .eq("organization_id", org)
        .eq("id", c.volunteer_id)
        .single(),
    );
    const n = await one(
      db
        .from("needs")
        .select("title")
        .eq("organization_id", org)
        .eq("id", c.need_id)
        .single(),
    );
    return ok({
      text: gifts
        .map((g: any) =>
          buildReceipt({ org: o, volunteer: v, need: n, contribution: g }),
        )
        .join("\n\n--------------------\n\n"),
    });
  }
  if (action === "reports") {
    staff();
    const p = reportSchema.parse(body);
    return ok(
      await result(
        db.rpc("run_reports", {
          p_org: org,
          p_from: p.from,
          p_to: p.to,
          p_county: p.county,
          p_donor: p.donor_id,
        }),
      ),
    );
  }
  if (action === "annual-reports") {
    staff();
    const p = z
      .object({ year: z.number().int().min(2000).max(9999) })
      .strict()
      .parse(body);
    const statements = await result(
      db
        .from("donor_statements")
        .select("*")
        .eq("organization_id", org)
        .eq("year", p.year)
        .order("generated_at", { ascending: false }),
    );
    const keys = (statements || []).map(
      (s: any) => `annual:${s.id}:${s.content_hash}`,
    );
    const emails = keys.length
      ? await result(
          db
            .from("notifications")
            .select("dedupe_key,status")
            .eq("organization_id", org)
            .in("dedupe_key", keys),
        )
      : [];
    return ok({
      statements: (statements || []).map((s: any) => ({
        ...s,
        email_status:
          emails?.find(
            (n: any) => n.dedupe_key === `annual:${s.id}:${s.content_hash}`,
          )?.status || "not queued",
      })),
    });
  }
  if (action === "generate-annual-reports") {
    staff();
    const p = z
      .object({
        year: z
          .number()
          .int()
          .min(2000)
          .max(new Date().getFullYear() - 1),
      })
      .strict()
      .parse(body);
    const o = await one(
      db.from("organizations").select("ein").eq("id", org).single(),
    );
    if (!o.ein)
      throw new HttpError(
        409,
        "Configure the organization EIN before sending annual donor statements.",
      );
    const queued = await result(
      db.rpc("prepare_annual_statements", { p_org: org, p_year: p.year }),
    );
    return ok({ queued });
  }
  if (action === "annual-statement") {
    staff();
    const p = z.object({ id: uuid }).strict().parse(body);
    const s = await one(
      db
        .from("donor_statements")
        .select("snapshot")
        .eq("organization_id", org)
        .eq("id", p.id)
        .single(),
    );
    return ok({ text: buildAnnualStatement(s.snapshot) });
  }
  if (action === "photo-upload") {
    const user = staff();
    const p = z
      .object({
        type: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z.number().int().min(1).max(5242880),
      })
      .strict()
      .parse(body);
    const path = `${org}/${user}/${randomUUID()}.${p.type === "image/png" ? "png" : p.type === "image/webp" ? "webp" : "jpg"}`;
    await result(
      db
        .from("need_photo_uploads")
        .insert({ path, organization_id: org, uploaded_by: user }),
    );
    const data = await createPhotoUpload(path);
    return ok({ path, token: data.token });
  }
  if (action === "attach-photo") {
    const user = staff();
    const p = z
      .object({
        need_id: uuid,
        path: z.string().max(500).nullable(),
        alt: z.string().trim().max(200),
      })
      .strict()
      .parse(body);
    if (p.path) {
      if (!p.alt)
        throw new HttpError(
          400,
          "Describe the photo for volunteers using screen readers.",
        );
      await validatePhoto(db, org, user, p.path);
    }
    await one(
      db
        .from("needs")
        .update({
          photo_path: p.path,
          photo_alt: p.alt,
          photo_approved_at: null,
        })
        .eq("organization_id", org)
        .eq("id", p.need_id)
        .select("id")
        .single(),
    );
    return ok();
  }
  if (action === "approve-photo") {
    staff();
    const p = receiptSchema.parse(body);
    await one(
      db
        .from("needs")
        .update({ photo_approved_at: new Date().toISOString() })
        .eq("organization_id", org)
        .eq("id", p.need_id)
        .not("photo_path", "is", null)
        .select("id")
        .single(),
    );
    return ok();
  }
  return false;
}
