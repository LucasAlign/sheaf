import { describe, it, expect } from "vitest";
import { csvCell, csvFile } from "../src/reportExport";
import { buildAnnualStatement } from "../server/reports";
import { validPhotoBytes } from "../server/photos";
import { needCounts } from "../src/NeedProgress";
import { demoNeeds } from "../src/demo";
import { claimSchema, confirmSchema, needSchema } from "../server/validation";
describe("quantity workflows", () => {
  it("distinguishes actual receipts from promises", () => {
    expect(
      needCounts({
        ...demoNeeds[0],
        quantity_required: 3,
        quantity_committed: 2,
        quantity_received: 0,
      }),
    ).toEqual({
      required: 3,
      committed: 2,
      received: 0,
      available: 1,
      outstanding: 3,
    });
    expect(
      needCounts({
        ...demoNeeds[0],
        quantity_required: 3,
        quantity_committed: 2,
        quantity_received: 2,
      }).outstanding,
    ).toBe(1);
  });
  it("accepts a partial claim and rejects zero or fractional quantities", () => {
    const p = {
      need_id: "6dce2651-9c26-49cc-8fcf-665eb70f1bf0",
      way: "Provide a dresser",
      quantity: 2,
    };
    expect(claimSchema.parse(p).quantity).toBe(2);
    expect(claimSchema.safeParse({ ...p, quantity: 0 }).success).toBe(false);
    expect(claimSchema.safeParse({ ...p, quantity: 1.5 }).success).toBe(false);
  });
  it("supports release without inventing a received contribution", () => {
    expect(
      confirmSchema.safeParse({
        claim_id: "6dce2651-9c26-49cc-8fcf-665eb70f1bf0",
        quantity: 0,
        release_remainder: true,
      }).success,
    ).toBe(true);
  });
  it("requires public location and poster identity on new needs", () => {
    const { id, status, created_at, approved_at, distance, ...need } =
      demoNeeds[0];
    expect(needSchema.safeParse(need).success).toBe(false);
    expect(
      needSchema.safeParse({
        ...need,
        public_location: "State College",
        poster_name: "Morgan, social worker",
      }).success,
    ).toBe(true);
  });
});
describe("donor reports", () => {
  it("quotes commas, quotes, newlines and neutralizes spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell(" +SUM(A1)")).toContain("' +SUM");
    expect(csvFile(["Name"], [['Jo, "Friend"']])).toContain('"Jo, ""Friend"""');
  });
  it("separates cash totals from noncash items in a year-end statement", () => {
    const text = buildAnnualStatement({
      year: 2025,
      organization: "Test charity",
      ein: "00-0000000",
      contact_email: "care@example.org",
      donor_name: "Jo",
      donor_email: "jo@example.org",
      cash_cents: 25000,
      contributions: [
        {
          id: "1",
          kind: "goods",
          quantity: 2,
          amount_cents: null,
          description: "Dressers",
          received_at: "2025-12-31T12:00:00Z",
        },
        {
          id: "2",
          kind: "funds",
          quantity: 1,
          amount_cents: 25000,
          description: "Gift",
          received_at: "2025-12-30T12:00:00Z",
        },
      ],
    });
    expect(text).toContain("2 × Dressers");
    expect(text).toContain("Total funds received: $250.00");
    expect(text).toContain("Noncash goods; no value assigned");
  });
});
describe("photo boundary", () => {
  it("rejects SVG and HTML masquerading as an image", () => {
    expect(
      validPhotoBytes(new TextEncoder().encode('<svg onload="alert(1)">')),
    ).toBe(false);
    expect(validPhotoBytes(new TextEncoder().encode("<html>bad</html>"))).toBe(
      false,
    );
  });
  it("recognizes permitted image signatures", () => {
    expect(validPhotoBytes(new Uint8Array([255, 216, 255, 224]))).toBe(true);
    expect(
      validPhotoBytes(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe(true);
  });
});
