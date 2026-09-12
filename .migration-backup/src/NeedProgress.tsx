import type { Need } from "./types";
export function needCounts(n: Need) {
  const required = n.quantity_required ?? 1,
    committed =
      n.quantity_committed ??
      (n.status === "claimed" || n.status === "completed" ? required : 0),
    received = n.quantity_received ?? (n.status === "completed" ? required : 0);
  return {
    required,
    committed,
    received,
    available: Math.max(0, required - committed),
    outstanding: Math.max(0, required - received),
  };
}
export default function NeedProgress({ need }: { need: Need }) {
  const c = needCounts(need);
  return (
    <div className="need-progress">
      <div>
        <strong>
          {c.received} of {c.required} {need.unit_label || "item"} received
        </strong>
        <span>
          {c.available > 0
            ? `${c.available} still needed`
            : c.received < c.required
              ? "Awaiting delivery confirmation"
              : "Confirmed complete"}
        </span>
      </div>
      <progress
        max={c.required}
        value={c.received}
        aria-label={`${c.received} of ${c.required} confirmed received`}
      />
      {c.committed > c.received && (
        <small>
          {c.committed - c.received} promised, not yet confirmed received
        </small>
      )}
    </div>
  );
}
