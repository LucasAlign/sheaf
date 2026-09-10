import { one, type DB } from "./db";
import { emailTemplate, sendEmail } from "./email";
import { buildReceipt } from "./receipt";
import { buildAnnualStatement } from "./reports";
import { escapeHtml } from "./security";
type Notice = {
  id: string;
  kind: string;
  volunteer_id: string | null;
  recipient_user_id: string | null;
  need_id: string | null;
  payload: Record<string, any>;
};
export async function deliverRecordEmail(
  db: DB,
  orgId: string,
  appUrl: string,
  n: Notice,
) {
  if (
    !["donation_receipt", "annual_statement", "need_completed"].includes(n.kind)
  )
    return false;
  const org = await one(
    db
      .from("organizations")
      .select("name,ein,contact_email")
      .eq("id", orgId)
      .single(),
  );
  let text = "",
    to = "",
    title = "",
    filename = "";
  if (n.kind === "donation_receipt") {
    const gift = await one(
      db
        .from("contributions")
        .select("*")
        .eq("organization_id", orgId)
        .eq("id", n.payload.contribution_id)
        .single(),
    );
    const claim = await one(
      db
        .from("claims")
        .select("volunteer_id,need_id")
        .eq("organization_id", orgId)
        .eq("id", gift.claim_id)
        .single(),
    );
    const volunteer = await one(
      db
        .from("volunteers")
        .select("name,email")
        .eq("organization_id", orgId)
        .eq("id", claim.volunteer_id)
        .single(),
    );
    const need = await one(
      db
        .from("needs")
        .select("title")
        .eq("organization_id", orgId)
        .eq("id", claim.need_id)
        .single(),
    );
    to = volunteer.email;
    title = "Thank you. Your donation receipt is here.";
    text = buildReceipt({ org, volunteer, need, contribution: gift });
    filename = `sheaf-receipt-${gift.id}.txt`;
  } else if (n.kind === "annual_statement") {
    const v = await one(
      db
        .from("volunteers")
        .select("email")
        .eq("organization_id", orgId)
        .eq("id", n.volunteer_id)
        .single(),
    );
    to = v.email;
    title = `Your ${n.payload.snapshot.year} annual giving statement`;
    text = buildAnnualStatement(n.payload.snapshot);
    filename = `sheaf-giving-${n.payload.snapshot.year}.txt`;
  } else {
    to = org.contact_email;
    if (n.recipient_user_id) {
      const { data, error } = await db.auth.admin.getUserById(
        n.recipient_user_id,
      );
      if (error || !data.user.email)
        throw new Error("Posting social worker email is unavailable");
      to = data.user.email;
    }
    title = "The need you posted has been met.";
    text = `${n.payload.title}\n\n${n.payload.quantity} ${n.payload.unit_label} confirmed received.\nA caseworker has verified fulfillment. Thank you for helping this family find the support they needed.`;
  }
  const html = emailTemplate(
    org.name,
    title,
    `<div style="white-space:pre-line">${escapeHtml(text)}</div>`,
    `${appUrl}/${n.kind === "need_completed" ? "" : "?view=feed"}`,
    n.kind === "need_completed" ? "Open your workspace" : "Open Sheaf",
  );
  await sendEmail(
    to,
    `${org.name}: ${title}`,
    html,
    n.id,
    filename
      ? [{ filename, content: Buffer.from(text).toString("base64") }]
      : [],
  );
  return true;
}
