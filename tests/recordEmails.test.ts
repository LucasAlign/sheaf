import { beforeEach, expect, it, vi } from "vitest";
import { deliverRecordEmail } from "../server/recordEmails";
import { sendEmail } from "../server/email";
import type { DB } from "../server/db";

vi.mock("../server/email", async (original) => ({
  ...(await original<typeof import("../server/email")>()),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => vi.clearAllMocks());
function database(posterEmail: string | null = "socialworker@example.org") {
  const records: Record<string, unknown> = {
    organizations: {
      name: "Keystone",
      ein: "00-0000000",
      contact_email: "office@example.org",
    },
    contributions: {
      id: "gift",
      claim_id: "claim",
      kind: "goods",
      quantity: 2,
      amount_cents: null,
      description: "Two dressers",
      received_at: "2025-12-31T23:00:00-05:00",
    },
    claims: { volunteer_id: "giver", need_id: "need" },
    volunteers: { name: "Jane", email: "giver@example.org" },
    needs: { title: "Three dressers" },
  };
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: records[table], error: null }),
      };
      return query;
    },
    auth: {
      admin: {
        getUserById: vi
          .fn()
          .mockResolvedValue({
            data: { user: { email: posterEmail } },
            error: null,
          }),
      },
    },
  } as unknown as DB;
}
const notice = {
  id: "notice",
  kind: "donation_receipt",
  volunteer_id: "giver",
  recipient_user_id: null,
  need_id: "need",
  payload: { contribution_id: "gift" },
};

it("emails the giver an attachment for the confirmed gift, without valuing goods", async () => {
  await deliverRecordEmail(database(), "org", "https://sheaf.example", notice);
  const call = vi.mocked(sendEmail).mock.calls[0];
  expect(call[0]).toBe("giver@example.org");
  const receipt = Buffer.from(call[4]![0].content, "base64").toString();
  expect(receipt).toContain("Quantity received: 2");
  expect(receipt).toContain("Two dressers");
  expect(receipt).not.toContain("Amount received:");
});
it("routes completion to the actual posting social worker instead of the office or giver", async () => {
  await deliverRecordEmail(database(), "org", "https://sheaf.example", {
    ...notice,
    kind: "need_completed",
    volunteer_id: null,
    recipient_user_id: "poster",
    payload: { title: "Three dressers", quantity: 3, unit_label: "dressers" },
  });
  expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(
    "socialworker@example.org",
  );
});
it("does not misroute completion when the posting social worker email is unavailable", async () => {
  await expect(
    deliverRecordEmail(database(null), "org", "https://sheaf.example", {
      ...notice,
      kind: "need_completed",
      volunteer_id: null,
      recipient_user_id: "poster",
    }),
  ).rejects.toThrow("Posting social worker email is unavailable");
  expect(sendEmail).not.toHaveBeenCalled();
});
it("emails the donor the annual snapshot as a downloadable attachment", async () => {
  await deliverRecordEmail(database(), "org", "https://sheaf.example", {
    ...notice,
    kind: "annual_statement",
    payload: {
      snapshot: {
        year: 2025,
        organization: "Keystone",
        ein: "00-0000000",
        contact_email: "office@example.org",
        donor_name: "Jane",
        donor_email: "giver@example.org",
        cash_cents: 2500,
        contributions: [
          {
            kind: "funds",
            quantity: 1,
            amount_cents: 2500,
            description: "Donation",
            received_at: "2025-12-31T12:00:00Z",
          },
        ],
      },
    },
  });
  const call = vi.mocked(sendEmail).mock.calls[0];
  expect(call[0]).toBe("giver@example.org");
  expect(call[4]![0].filename).toBe("sheaf-giving-2025.txt");
  expect(Buffer.from(call[4]![0].content, "base64").toString()).toContain(
    "Total funds received: $25.00",
  );
});
