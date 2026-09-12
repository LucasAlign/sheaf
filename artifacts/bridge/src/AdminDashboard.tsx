import BridgeMark from "./BridgeMark";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Mail,
  MoreHorizontal,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Need, Status } from "./types";
import { api, live } from "./client";
export type AdminTab = "overview" | "pipeline" | "outreach" | "reports";
type Summary = {
  sent: number;
  queued: number;
  failed: number;
  volunteers: number;
  recent: {
    id: string;
    kind: string;
    status: string;
    created_at: string;
    send_after: string;
  }[];
};
const initial: Summary = {
  sent: 0,
  queued: 0,
  failed: 0,
  volunteers: 0,
  recent: [],
};
const demo: Summary = {
  sent: 24,
  queued: 6,
  failed: 0,
  volunteers: 38,
  recent: [
    {
      id: "demo-mail1",
      kind: "match",
      status: "sent",
      created_at: new Date().toISOString(),
      send_after: new Date().toISOString(),
    },
    {
      id: "demo-mail2",
      kind: "digest",
      status: "queued",
      created_at: new Date().toISOString(),
      send_after: new Date(Date.now() + 86400000).toISOString(),
    },
  ],
};
const format = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const label = {
  pending: "To approve",
  open: "Open",
  claimed: "Claimed",
  completed: "Completed",
};
export default function AdminDashboard({
  needs,
  tab,
  busy,
  post,
  invite,
  select,
  transition,
  remind,
  setTab,
}: {
  needs: Need[];
  tab: AdminTab;
  busy: boolean;
  post: () => void;
  invite: () => void;
  select: (n: Need) => void;
  transition: (n: Need, s: Status) => void;
  remind: (n: Need) => void;
  setTab: (t: AdminTab) => void;
}) {
  const [summary, setSummary] = useState<Summary>(live ? initial : demo);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!live) return;
    let active = true;
    const load = async () => {
      try {
        const d = await api<Summary>("outreach");
        if (active) {
          setSummary(d);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const id = setInterval(load, 45000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [needs]);
  const pending = needs.filter((n) => n.status === "pending");
  const open = needs.filter((n) => n.status === "open");
  const claimed = needs.filter((n) => n.status === "claimed");
  const completed = needs.filter((n) => n.status === "completed");
  const metrics = [
    {
      title: "Open needs",
      count: open.length,
      detail: "Ready for the right person",
      icon: Box,
      color: "pine",
    },
    {
      title: "Awaiting approval",
      count: pending.length,
      detail: pending.length
        ? "A little review, then a big difference"
        : "Every published need is verified",
      icon: ShieldCheck,
      color: "clay",
    },
    {
      title: "In good hands",
      count: claimed.length,
      detail: "Claimed by a caring volunteer",
      icon: Heart,
      color: "blue",
    },
    {
      title: "Needs fulfilled",
      count: completed.length,
      detail: "Small acts. Real follow-through.",
      icon: Check,
      color: "olive",
    },
  ];
  return (
    <div className="admin-workspace">
      <div className="admin-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-dot" /> KEYSTONE FAMILY ALLIANCE · ADMIN
            WORKSPACE
          </div>
          <h1>
            {tab === "overview" ? (
              <>
                Good care. <em>Thoughtfully connected.</em>
              </>
            ) : tab === "pipeline" ? (
              "Every need, a next step."
            ) : (
              "The right person. The right moment."
            )}
          </h1>
          <p>
            {tab === "overview"
              ? "A clear view of the needs, people, and small acts moving your community forward."
              : tab === "pipeline"
                ? "From a verified need to a promise kept."
                : "Personal invitations to help, sent in thoughtful waves."}
          </p>
        </div>
        <button className="button primary" onClick={post}>
          <Plus size={17} /> Post a need
        </button>
      </div>
      <div className="admin-stats">
        {metrics.map((m) => (
          <button key={m.title} onClick={() => setTab("pipeline")}>
            <div>
              <span>{m.title}</span>
              <span className={`stat-icon ${m.color}`}>
                <m.icon size={18} strokeWidth={1.7} />
              </span>
            </div>
            <strong>{m.count.toString().padStart(2, "0")}</strong>
            <small>{m.detail}</small>
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === "pipeline" ? (
        <div className="pipeline">
          {(["pending", "open", "claimed", "completed"] as Status[]).map(
            (status) => (
              <section className="pipeline-column" key={status}>
                <h2>
                  <span className={`status-dot ${status}`} />
                  {label[status]}
                  <span>{needs.filter((n) => n.status === status).length}</span>
                </h2>
                {needs
                  .filter((n) => n.status === status)
                  .map((n) => (
                    <article className="pipeline-card" key={n.id}>
                      <span className={`urgency ${n.urgency}`}>
                        {n.urgency === "critical"
                          ? "Urgent"
                          : n.urgency === "soon"
                            ? "Needed soon"
                            : "Flexible"}
                      </span>
                      <h3>{n.title}</h3>
                      <p>
                        {n.service_area} County · By {format(n.needed_by)}
                      </p>
                      <button className="text-button" onClick={() => select(n)}>
                        Review need <ArrowRight size={14} />
                      </button>
                      {status === "pending" && (
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={() => transition(n, "open")}
                        >
                          <ShieldCheck size={16} /> Verify & publish
                        </button>
                      )}
                      {status === "claimed" && (
                        <>
                          <button
                            className="button primary full"
                            disabled={busy}
                            onClick={() => select(n)}
                          >
                            <Check size={16} />
                            Confirm delivery
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => remind(n)}
                          >
                            <Bell size={14} />
                            Send reminder
                          </button>
                        </>
                      )}
                      {status === "completed" && (
                        <button
                          className="text-button"
                          onClick={() => select(n)}
                        >
                          Record contribution / receipt
                        </button>
                      )}
                    </article>
                  ))}
                {!needs.some((n) => n.status === status) && (
                  <div className="column-empty">
                    {status === "pending"
                      ? "New needs wait here for your review."
                      : "Nothing here yet."}
                  </div>
                )}
              </section>
            ),
          )}
        </div>
      ) : (
        <div className="admin-columns">
          <div className="admin-main-column">
            {tab === "overview" && (
              <section className="admin-panel needs-panel">
                <div className="panel-header">
                  <div>
                    <h2>Needs at a glance</h2>
                    <p>What’s happening across your community</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("pipeline")}
                  >
                    View pipeline <ArrowRight size={15} />
                  </button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-needs-table">
                    <thead>
                      <tr>
                        <th>NEED</th>
                        <th>STATUS</th>
                        <th>NEEDED BY</th>
                        <th>
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pending, ...claimed, ...open, ...completed]
                        .slice(0, 6)
                        .map((n) => (
                          <tr key={n.id}>
                            <td>
                              <button onClick={() => select(n)}>
                                <span
                                  className={`table-category ${n.category.replace(" ", "-")}`}
                                >
                                  <Box size={17} />
                                </span>
                                <span>
                                  <strong>{n.title}</strong>
                                  <small>
                                    {n.service_area} County · {n.category}
                                  </small>
                                  <small>{n.quantity_received || 0} of {n.quantity_required || 1} {n.unit_label || 'item'} confirmed received</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className={`need-status ${n.status}`}>
                                <span />
                                {label[n.status]}
                              </span>
                            </td>
                            <td
                              className={
                                n.urgency === "critical"
                                  ? "deadline-urgent"
                                  : ""
                              }
                            >
                              {format(n.needed_by)}
                              {n.urgency === "critical" && (
                                <small>Urgent</small>
                              )}
                            </td>
                            <td>
                              <button
                                aria-label={`View ${n.title}`}
                                className="icon-button"
                                onClick={() => select(n)}
                              >
                                <ChevronRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!needs.length && (
                    <div className="empty-state">
                      <BridgeMark size={30} />
                      <h3>Your first need starts a connection.</h3>
                      <p>
                        Post a need, verify it, and let Bridge find volunteers
                        who fit.
                      </p>
                      <button className="button primary" onClick={post}>
                        Post your first need <Plus size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="panel-footer">
                  <ShieldCheck size={14} />
                  <span>Only verified needs are shared with volunteers.</span>
                  <span>{needs.length} total needs</span>
                </div>
              </section>
            )}
            <section className="admin-panel outreach-panel">
              <div className="panel-header">
                <div className="with-icon">
                  <span className="outreach-icon">
                    <Send size={18} />
                  </span>
                  <div>
                    <h2>Email outreach</h2>
                    <p>Matched with purpose. Never sent to everyone.</p>
                  </div>
                </div>
                <span className="live-label">
                  <span className="tiny-dot" />
                  {live ? "Live activity" : "Sample activity"}
                </span>
              </div>
              <div className="outreach-metrics">
                <div>
                  <strong>{summary.sent}</strong>
                  <span>Delivered · last 7 days</span>
                </div>
                <div>
                  <strong>{summary.queued}</strong>
                  <span>In the next waves</span>
                </div>
                <div>
                  <strong>{summary.volunteers}</strong>
                  <span>Verified volunteers</span>
                </div>
              </div>
              <div className="wave-visual">
                <div className="wave-stage">
                  <span className="wave-number">01</span>
                  <div>
                    <strong>Start with the best fit</strong>
                    <small>Top 3 available matches</small>
                  </div>
                </div>
                <ArrowRight size={17} />
                <div className="wave-stage">
                  <span className="wave-number">02</span>
                  <div>
                    <strong>Give them a moment</strong>
                    <small>Time to say “I can help”</small>
                  </div>
                </div>
                <ArrowRight size={17} />
                <div className="wave-stage">
                  <span className="wave-number">03</span>
                  <div>
                    <strong>Widen with care</strong>
                    <small>Next 6, then next 9</small>
                  </div>
                </div>
              </div>
              {summary.failed > 0 && (
                <p className="error">
                  {summary.failed} emails need attention. Check the delivery
                  provider before retrying.
                </p>
              )}
              {tab === "outreach" && (
                <div className="outbox">
                  <h3>Recent delivery activity</h3>
                  {summary.recent.length ? (
                    summary.recent.map((n) => (
                      <div key={n.id}>
                        <Mail size={17} />
                        <span>
                          <strong>{n.kind.replace("_", " ")}</strong>
                          <small>{format(n.created_at)}</small>
                        </span>
                        <span
                          className={`need-status ${n.status === "sent" ? "completed" : n.status === "failed" ? "pending" : "open"}`}
                        >
                          {n.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>
                      No emails have been queued yet. Approved needs and
                      opted-in volunteers start the first wave.
                    </p>
                  )}
                </div>
              )}
              <div className="panel-footer">
                <Clock3 size={14} />
                <span>
                  Urgent: 15 min · Needed soon: 4 hr · Flexible: 24 hr
                </span>
                {tab === "overview" && (
                  <button
                    className="text-button"
                    onClick={() => setTab("outreach")}
                  >
                    View outreach <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </section>
          </div>
          <aside className="admin-side-column">
            <section className="review-card">
              <div className="review-icon">
                <ShieldCheck size={21} />
              </div>
              <div className="eyebrow">A MOMENT OF CARE</div>
              <h2>
                {pending.length
                  ? `${pending.length} ${pending.length === 1 ? "need is" : "needs are"} waiting for your yes.`
                  : "A trusted start for every need."}
              </h2>
              <p>
                {pending.length
                  ? "Check the details and protect the family’s privacy. Then we’ll find the right people to help."
                  : "Review each need before it reaches a volunteer. Your care makes every connection a little more certain."}
              </p>
              <button
                className="button secondary full"
                onClick={() => (pending.length ? select(pending[0]) : post)}
              >
                {pending.length
                  ? "Review the next need"
                  : "Create a verified need"}
                <ArrowRight size={16} />
              </button>
              <span className="review-footnote">
                <ShieldCheck size={13} />
                Verified before it’s ever shared
              </span>
            </section>
            <section className="volunteer-card">
              <div className="volunteer-card-top">
                <span>
                  <Users size={20} />
                </span>
                <ArrowUpRight size={18} />
              </div>
              <h2>Grow your circle of care.</h2>
              <p>
                Invite a volunteer to share how and when they can help. We’ll
                take it from there.
              </p>
              <button className="text-button" onClick={invite}>
                Invite a volunteer <Plus size={15} />
              </button>
            </section>
            <div className="admin-quote">
              <BridgeMark size={25} />
              <p>
                “A need on one side.
                <br />
                A neighbor on the other.”
              </p>
              <span>THE HEART BEHIND BRIDGE</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
