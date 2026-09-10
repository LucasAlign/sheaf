import type { StatementSnapshot } from "../src/types";
export function buildAnnualStatement(s: StatementSnapshot) {
  return [
    `${s.year} ANNUAL GIVING STATEMENT`,
    s.organization,
    `EIN: ${s.ein}`,
    `Contact: ${s.contact_email}`,
    "",
    `Donor: ${s.donor_name}`,
    `Calendar year: January 1 – December 31, ${s.year}`,
    "",
    ...s.contributions.map(
      (g) =>
        `${new Date(g.received_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })} · ${g.quantity} × ${g.description}${g.kind === "funds" ? ` · ${(Number(g.amount_cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : " · Noncash goods; no value assigned"}`,
    ),
    "",
    `Total funds received: ${(Number(s.cash_cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
    "Noncash goods are listed separately and are not included in the funds total.",
    "No goods or services were provided by the organization in exchange for these contributions.",
    "Please retain this statement for your records. Bridge does not determine tax deductibility.",
  ].join("\n");
}
