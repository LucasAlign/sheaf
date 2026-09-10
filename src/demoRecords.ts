import type {
  Claim,
  Gift,
  Need,
  Profile,
  ReportData,
  Statement,
} from "./types";
import { needCounts } from "./NeedProgress";
type Records = { claims: Claim[]; gifts: Gift[]; statements: Statement[] };
const key = "sheaf-demo-records-v1";
export function demoRecords(): Records {
  try {
    return (
      JSON.parse(localStorage.getItem(key) || "null") || {
        claims: [],
        gifts: [],
        statements: [],
      }
    );
  } catch {
    return { claims: [], gifts: [], statements: [] };
  }
}
function save(r: Records) {
  localStorage.setItem(key, JSON.stringify(r));
}
export function resetDemoRecords() {
  localStorage.removeItem(key);
}
export function hydrateDemoNeeds(needs: Need[]) {
  const r = demoRecords();
  const ns = needs.map((n) => ({
    ...n,
    poster_name: n.poster_name || "Keystone caseworker (sample)",
    public_location:
      n.public_location || `${n.service_area} County, Pennsylvania`,
  }));
  if (!ns.some((n) => n.id === "demo-dressers")) {
    ns.unshift({
      id: "demo-dressers",
      title: "Three dressers for a fresh start",
      description:
        "A foster family needs three dressers. Two have been received and confirmed; one more would give each child a space for their things.",
      category: "goods",
      urgency: "soon",
      service_area: "Centre",
      ways_to_help: ["Provide a dresser"],
      capability_tags: ["goods"],
      needed_by: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      status: "open",
      window_start: null,
      window_end: null,
      quantity_required: 3,
      quantity_committed: 2,
      quantity_received: 2,
      unit_label: "dressers",
      poster_name: "Morgan Ellis · Social worker (sample)",
      public_location: "State College, Centre County",
      distance: 3.2,
    });
    if (!r.claims.some((c) => c.need_id === "demo-dressers"))
      r.claims.push({
        id: "demo-dresser-gift",
        need_id: "demo-dressers",
        volunteer_id: "demo-giver",
        name: "Jane R. (sample giver)",
        email: "giver@example.org",
        way: "Provide a dresser",
        quantity: 2,
        fulfilled_quantity: 2,
        reported_quantity: null,
        receipted_quantity: 0,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
  }
  for (const n of ns) {
    if (
      n.claimed_by_me &&
      !r.claims.some(
        (c) => c.need_id === n.id && c.volunteer_id === "demo-self",
      )
    )
      r.claims.push({
        id: crypto.randomUUID(),
        need_id: n.id,
        volunteer_id: "demo-self",
        name: "Demo volunteer",
        email: "volunteer@example.org",
        way: n.ways_to_help[0],
        quantity: n.quantity_committed || 1,
        fulfilled_quantity:
          n.status === "completed" ? n.quantity_required || 1 : 0,
        reported_quantity: null,
        receipted_quantity: 0,
        created_at: n.created_at,
        completed_at:
          n.status === "completed" ? new Date().toISOString() : null,
      });
  }
  save(r);
  return syncDemoNeeds(ns);
}
export function demoClaim(
  n: Need,
  quantity: number,
  p: Profile,
  way = n.ways_to_help[0],
) {
  const r = demoRecords();
  if (
    r.claims.some(
      (c) =>
        c.need_id === n.id && c.volunteer_id === "demo-self" && c.quantity > 0,
    )
  )
    return;
  if (quantity > needCounts(n).available)
    throw new Error("Not enough quantity remains.");
  r.claims.push({
    id: crypto.randomUUID(),
    need_id: n.id,
    volunteer_id: "demo-self",
    name: p.name || "Demo volunteer",
    email: p.email || "volunteer@example.org",
    way,
    quantity,
    fulfilled_quantity: 0,
    reported_quantity: null,
    receipted_quantity: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
  });
  save(r);
}
export function syncDemoNeeds(needs: Need[]) {
  const r = demoRecords();
  return needs.map((n) => {
    const claims = r.claims.filter((c) => c.need_id === n.id);
    if (!claims.length) return n;
    const committed = claims.reduce((s, c) => s + c.quantity, 0),
      received = claims.reduce((s, c) => s + c.fulfilled_quantity, 0),
      required = n.quantity_required ?? 1;
    return {
      ...n,
      quantity_committed: committed,
      quantity_received: received,
      claimed_by_me: claims.some(
        (c) => c.volunteer_id === "demo-self" && c.quantity > 0,
      ),
      status:
        n.status === "pending"
          ? "pending"
          : received >= required
            ? "completed"
            : committed >= required
              ? "claimed"
              : "open",
    } as Need;
  });
}
export function demoDeliver(
  claimId: string,
  quantity: number,
  confirm: boolean,
  release = false,
  gift?: Record<string, any> | null,
  need?: Need,
) {
  const r = demoRecords();
  const c = r.claims.find((x) => x.id === claimId);
  if (!c || quantity < c.fulfilled_quantity || quantity > c.quantity)
    throw new Error("Choose a valid received quantity.");
  if (!confirm) c.reported_quantity = quantity;
  else {
    c.fulfilled_quantity = quantity;
    c.reported_quantity = null;
    if (release) c.quantity = quantity;
    c.completed_at = c.quantity === quantity ? new Date().toISOString() : null;
    if (gift && need) {
      const previous = r.gifts
        .filter((g) => g.claim_id === c.id)
        .reduce((s, g) => s + g.quantity, 0);
      if (previous + gift.quantity > quantity)
        throw new Error("Receipts cannot exceed confirmed contributions.");
      r.gifts.push({
        id: crypto.randomUUID(),
        claim_id: c.id,
        received_at: gift.received_at,
        kind: gift.kind,
        quantity: gift.quantity,
        amount_cents: gift.kind === "funds" ? gift.amount_cents : null,
        description: gift.description,
        donor_id: c.volunteer_id,
        donor_name: c.name,
        donor_email: c.email,
        title: need.title,
        service_area: need.service_area,
        receipt_status: "demo — not sent",
      });
      c.receipted_quantity = previous + gift.quantity;
    }
  }
  save(r);
}
export function demoGift(
  claimId: string,
  gift: Record<string, any>,
  need: Need,
) {
  const c = demoRecords().claims.find((x) => x.id === claimId);
  if (!c) throw new Error("Claim not found");
  demoDeliver(claimId, c.fulfilled_quantity, true, false, gift, need);
}
export function demoReport(
  needs: Need[],
  from: string,
  to: string,
  county: string,
): ReportData {
  return {
    contributions: demoRecords().gifts.filter(
      (g) =>
        g.received_at.slice(0, 10) >= from &&
        g.received_at.slice(0, 10) <= to &&
        (!county || g.service_area === county),
    ),
    needs: needs.filter(
      (n) =>
        n.created_at.slice(0, 10) >= from &&
        n.created_at.slice(0, 10) <= to &&
        (!county || n.service_area === county),
    ),
  };
}
export function generateDemoAnnual(year: number, orgName: string) {
  const r = demoRecords();
  let queued = 0;
  const gifts = r.gifts.filter(
    (g) => new Date(g.received_at).getFullYear() === year,
  );
  for (const donor of new Set(gifts.map((g) => g.donor_id))) {
    const gs = gifts.filter((g) => g.donor_id === donor);
    const snapshot = {
      year,
      organization: orgName,
      ein: "DEMO — NOT A TAX RECEIPT",
      contact_email: "care@example.org",
      donor_name: gs[0].donor_name,
      donor_email: gs[0].donor_email,
      cash_cents: gs.reduce(
        (s, g) => s + (g.kind === "funds" ? Number(g.amount_cents) : 0),
        0,
      ),
      contributions: gs,
    };
    const existing = r.statements.find(
      (s) => s.year === year && s.snapshot.donor_email === snapshot.donor_email,
    );
    if (
      existing &&
      JSON.stringify(existing.snapshot) === JSON.stringify(snapshot)
    )
      continue;
    if (existing) {
      existing.snapshot = snapshot;
      existing.generated_at = new Date().toISOString();
    } else
      r.statements.push({
        id: crypto.randomUUID(),
        year,
        generated_at: new Date().toISOString(),
        snapshot,
        email_status: "demo — not sent",
      });
    queued++;
  }
  save(r);
  return queued;
}
