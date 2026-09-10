import { useEffect, useState } from "react";
import { Check, Mail, Download, PackageCheck } from "lucide-react";
import type { Claim, Need } from "./types";
import { api, live } from "./client";
import { demoRecords, demoDeliver, demoGift } from "./demoRecords";
import { downloadText } from "./reportExport";
export default function FulfillmentPanel({
  need,
  admin,
  onChange,
}: {
  need: Need;
  admin: boolean;
  onChange: () => void | Promise<void>;
}) {
  const [claims, setClaims] = useState<Claim[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    if (live) {
      const data = await api<{ claims: Claim[] }>("claim-details", {
        need_id: need.id,
      });
      setClaims(data.claims);
    } else
      setClaims(
        demoRecords().claims.filter(
          (c) =>
            c.need_id === need.id && (admin || c.volunteer_id === "demo-self"),
        ),
      );
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [need, admin]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await onChange();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fulfillment-panel">
      <h3>
        <PackageCheck size={18} />
        {admin ? "Deliveries & confirmation" : "Your commitment"}
      </h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="privacy-note" role="status">
          {message}
        </p>
      )}
      {!claims.length ? (
        <p>
          No commitments yet. Volunteers can provide part or all of the
          remaining quantity.
        </p>
      ) : (
        claims.map((c) => (
          <ClaimRow
            key={c.id + ":" + c.fulfilled_quantity + ":" + c.receipted_quantity}
            c={c}
            need={need}
            admin={admin}
            busy={busy}
            submit={(quantity, release, gift) =>
              act(async () => {
                if (live) {
                  if (admin)
                    await api("confirm-delivery", {
                      claim_id: c.id,
                      quantity,
                      release_remainder: release,
                      gift,
                    });
                  else
                    await api("report-delivery", { claim_id: c.id, quantity });
                } else demoDeliver(c.id, quantity, admin, release, gift, need);
                setMessage(
                  admin
                    ? gift
                      ? live
                        ? "Delivery confirmed. The donor receipt is queued for email."
                        : "Demo delivery and receipt recorded. No email sent."
                      : "Received quantity confirmed. Totals are updated."
                    : "Delivery reported. A caseworker will confirm receipt.",
                );
              })
            }
            record={(gift) =>
              act(async () => {
                if (live) await api("contribution", { claim_id: c.id, gift });
                else demoGift(c.id, gift, need);
                setMessage(
                  live
                    ? "The donor receipt is queued for email."
                    : "Demo contribution recorded. No email sent.",
                );
              })
            }
            receipt={() =>
              act(async () => {
                if (!live) {
                  const gifts = demoRecords().gifts.filter(
                    (g) => g.claim_id === c.id,
                  );
                  downloadText(
                    "DEMO — NOT A TAX RECEIPT\n" +
                      gifts
                        .map(
                          (g) =>
                            `${g.quantity} × ${g.description} (${g.received_at.slice(0, 10)})`,
                        )
                        .join("\n"),
                    "demo-receipt.txt",
                  );
                } else {
                  const r = await api<{ text: string }>("receipt", {
                    claim_id: c.id,
                  });
                  downloadText(r.text, "bridge-donation-receipts.txt");
                }
              })
            }
          />
        ))
      )}
    </section>
  );
}
function ClaimRow({
  c,
  need,
  admin,
  busy,
  submit,
  record,
  receipt,
}: {
  c: Claim;
  need: Need;
  admin: boolean;
  busy: boolean;
  submit: (
    quantity: number,
    release: boolean,
    gift: Record<string, unknown> | null,
  ) => void;
  record: (gift: Record<string, unknown>) => void;
  receipt: () => void;
}) {
  const [quantity, setQuantity] = useState(c.reported_quantity ?? c.quantity),
    [release, setRelease] = useState(false),
    [withReceipt, setWithReceipt] = useState(
      ["goods", "meals", "funds"].includes(need.category),
    ),
    [requestId] = useState(() => crypto.randomUUID());
  const outstanding = c.quantity - c.fulfilled_quantity,
    unreceipted = c.fulfilled_quantity - c.receipted_quantity;
  function gift(form: HTMLFormElement, qty: number) {
    const f = new FormData(form);
    return {
      request_id: requestId,
      quantity: qty,
      kind: need.category === "funds" ? "funds" : "goods",
      amount_cents: Math.round(Number(f.get("amount") || 0) * 100),
      description: String(f.get("description") || need.title),
      received_at: new Date(String(f.get("date")) + "T00:00:00").toISOString(),
    };
  }
  const giftFields = (
    <>
      <label>
        Donation description
        <input
          name="description"
          defaultValue={`${need.unit_label || "Item"} for ${need.title}`}
          required
          maxLength={500}
        />
      </label>
      {need.category === "funds" && (
        <label>
          Amount received ($)
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </label>
      )}
      <label>
        Date received
        <input
          name="date"
          type="date"
          defaultValue={new Date(
            Date.now() - new Date().getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 10)}
          max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10)}
          required
        />
      </label>
      <label className="consent-row">
        <input type="checkbox" required />
        The organization received this gift and provided no goods or services in
        exchange.
      </label>
    </>
  );
  return (
    <article className="claim-record">
      <div className="claim-record-head">
        <div>
          <strong>{admin ? c.name : "Your help"}</strong>
          {admin && (
            <a href={`mailto:${c.email}`}>
              <Mail size={13} />
              {c.email}
            </a>
          )}
        </div>
        <span>
          {c.fulfilled_quantity} / {c.quantity} received
        </span>
      </div>
      <p>
        {c.way}
        {c.reported_quantity !== null &&
          ` · Volunteer reports ${c.reported_quantity} delivered — awaiting confirmation`}
      </p>
      {outstanding > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(
              quantity,
              release,
              admin && withReceipt && quantity > c.fulfilled_quantity
                ? gift(e.currentTarget, quantity - c.fulfilled_quantity)
                : null,
            );
          }}
        >
          <label>
            {admin
              ? "Total actually received from this giver"
              : "Total you have delivered"}
            <input
              type="number"
              min={admin ? c.fulfilled_quantity : c.fulfilled_quantity + 1}
              max={c.quantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </label>
          {admin && (
            <>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={release}
                  onChange={(e) => setRelease(e.target.checked)}
                />
                Release any unprovided balance so someone else can help.
              </label>
              {["goods", "meals", "funds"].includes(need.category) &&
                quantity > c.fulfilled_quantity && (
                  <label className="consent-row">
                    <input
                      type="checkbox"
                      checked={withReceipt}
                      onChange={(e) => setWithReceipt(e.target.checked)}
                    />
                    Record this donation and email the giver a receipt.
                  </label>
                )}
              {withReceipt && quantity > c.fulfilled_quantity && giftFields}
            </>
          )}
          <button className="button primary full" disabled={busy}>
            <Check size={16} />
            {admin
              ? "Confirm received quantity"
              : "Report delivered — request confirmation"}
          </button>
        </form>
      )}
      {admin &&
        unreceipted > 0 &&
        ["goods", "meals", "funds"].includes(need.category) && (
          <details>
            <summary>
              Record donation & email receipt ({unreceipted} unreceipted)
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                record(gift(e.currentTarget, unreceipted));
              }}
            >
              {giftFields}
              <button className="button secondary full" disabled={busy}>
                <Mail size={16} />
                Record & email receipt
              </button>
            </form>
          </details>
        )}
      {c.receipted_quantity > 0 && (
        <button className="text-button" onClick={receipt} disabled={busy}>
          <Download size={15} />
          Download donor receipt
        </button>
      )}
      {outstanding === 0 && (
        <p className="privacy-note">
          <Check size={16} />
          {c.quantity === 0
            ? "Commitment released."
            : "Receipt of these items is confirmed."}
        </p>
      )}
    </article>
  );
}
