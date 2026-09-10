type ReceiptInput = {
  org: { name: string; ein: string | null; contact_email: string };
  volunteer: { name: string };
  need: { title: string };
  contribution: {
    id: string;
    kind: string;
    amount_cents: number | null;
    description: string;
    received_at: string;
    quantity?: number;
  };
};
export function buildReceipt({
  org,
  volunteer,
  need,
  contribution: c,
}: ReceiptInput) {
  if (!org.ein)
    throw new Error(
      "The organization must configure its EIN before issuing tax acknowledgments.",
    );
  return [
    `CONTRIBUTION ACKNOWLEDGMENT`,
    org.name,
    `EIN: ${org.ein}`,
    `Contact: ${org.contact_email}`,
    "",
    `Receipt: ${c.id}`,
    `Received: ${new Date(c.received_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
    `Contributor: ${volunteer.name}`,
    `Need: ${need.title}`,
    `Contribution: ${c.description}`,
    `Quantity received: ${c.quantity || 1}`,
    c.kind === "funds"
      ? `Amount received: ${(Number(c.amount_cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`
      : "Noncash goods received. No monetary value has been assigned by the organization.",
    "",
    "No goods or services were provided by the organization in exchange for this contribution.",
    "Please retain this acknowledgment for your records.",
    "Sheaf does not determine the deductibility or value of a contribution.",
  ].join("\n");
}
