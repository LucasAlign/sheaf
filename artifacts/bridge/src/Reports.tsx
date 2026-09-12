import { useEffect, useState } from "react";
import {
  Download,
  FileText,
  CalendarClock,
  Mail,
  RefreshCw,
} from "lucide-react";
import { api, live } from "./client";
import type { Need, ReportData, Statement } from "./types";
import { counties } from "./counties";
import { csvFile, downloadText } from "./reportExport";
import { demoReport, demoRecords, generateDemoAnnual } from "./demoRecords";
import { buildAnnualStatement } from "./server/reports";
export default function Reports({
  needs,
  orgName,
}: {
  needs: Need[];
  orgName: string;
}) {
  const now = new Date(),
    [from, setFrom] = useState(`${now.getFullYear()}-01-01`),
    [to, setTo] = useState(now.toISOString().slice(0, 10)),
    [county, setCounty] = useState(""),
    [donor, setDonor] = useState(""),
    [tab, setTab] = useState<"gifts" | "needs" | "annual">("gifts");
  const [data, setData] = useState<ReportData>({
      contributions: [],
      needs: [],
    }),
    [year, setYear] = useState(now.getFullYear() - 1),
    [statements, setStatements] = useState<Statement[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      if (from > to)
        throw new Error("Choose an end date after the start date.");
      const d = live
        ? await api<ReportData>("reports", {
            from,
            to,
            county: county || null,
            donor_id: null,
          })
        : demoReport(needs, from, to, county);
      setData(d);
      setMessage("Report updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function annual() {
    try {
      setStatements(
        live
          ? (await api<{ statements: Statement[] }>("annual-reports", { year }))
              .statements
          : demoRecords().statements.filter((s) => s.year === year),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void run();
  }, []);
  useEffect(() => {
    void annual();
  }, [year]);
  const gifts = data.contributions.filter(
      (g) => !donor || g.donor_id === donor,
    ),
    donors = [
      ...new Map(
        data.contributions.map((g) => [g.donor_id, g.donor_name]),
      ).entries(),
    ];
  const dollars =
    gifts.reduce(
      (s, g) => s + (g.kind === "funds" ? Number(g.amount_cents) : 0),
      0,
    ) / 100;
  return (
    <section className="reports-page">
      <div className="admin-heading">
        <div>
          <div className="eyebrow">
            <FileText size={15} />
            REPORTS & DONOR RECORDS
          </div>
          <h1>
            Every gift. <em>A clear record.</em>
          </h1>
          <p>
            Track received contributions, fulfillment, and each donor’s year-end
            statement.
          </p>
        </div>
      </div>
      <div className="report-tabs">
        <button
          className={tab === "gifts" ? "selected" : ""}
          onClick={() => setTab("gifts")}
        >
          Giving report
        </button>
        <button
          className={tab === "needs" ? "selected" : ""}
          onClick={() => setTab("needs")}
        >
          Need fulfillment
        </button>
        <button
          className={tab === "annual" ? "selected" : ""}
          onClick={() => setTab("annual")}
        >
          Annual donor statements
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="report-message">
          {message}
        </p>
      )}
      {tab !== "annual" ? (
        <>
          <form
            className="report-filters"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </label>
            <label>
              County
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              >
                <option value="">All counties</option>
                {counties.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {tab === "gifts" && (
              <label>
                Donor
                <select
                  value={donor}
                  onChange={(e) => setDonor(e.target.value)}
                >
                  <option value="">All donors</option>
                  {donors.map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="button primary" disabled={busy}>
              <RefreshCw size={16} />
              {busy ? "Running…" : "Run report"}
            </button>
          </form>
          <div className="report-stats">
            <div>
              <span>Funds received</span>
              <strong>
                {dollars.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </strong>
            </div>
            <div>
              <span>Noncash items received</span>
              <strong>
                {gifts
                  .filter((g) => g.kind === "goods")
                  .reduce((s, g) => s + g.quantity, 0)}
              </strong>
            </div>
            <div>
              <span>Contributing donors</span>
              <strong>{new Set(gifts.map((g) => g.donor_id)).size}</strong>
            </div>
            <div>
              <span>Needs confirmed complete</span>
              <strong>
                {data.needs.filter((n) => n.status === "completed").length}
              </strong>
            </div>
          </div>
          <div className="admin-panel">
            <div className="panel-header">
              <h2>
                {tab === "gifts"
                  ? "Confirmed giving"
                  : "Needs created in this period"}
              </h2>
              <button
                className="text-button"
                onClick={() => {
                  const text =
                    tab === "gifts"
                      ? csvFile(
                          [
                            "Received",
                            "Donor",
                            "Email",
                            "Kind",
                            "Quantity",
                            "Funds USD",
                            "Description",
                            "Need",
                            "County",
                            "Receipt email",
                          ],
                          gifts.map((g) => [
                            g.received_at,
                            g.donor_name,
                            g.donor_email,
                            g.kind,
                            g.quantity,
                            g.kind === "funds"
                              ? Number(g.amount_cents) / 100
                              : "",
                            g.description,
                            g.title,
                            g.service_area,
                            g.receipt_status,
                          ]),
                        )
                      : csvFile(
                          [
                            "Need",
                            "County",
                            "Posted by",
                            "Status",
                            "Requested",
                            "Promised",
                            "Received",
                            "Created",
                            "Completed",
                          ],
                          data.needs.map((n) => [
                            n.title,
                            n.service_area,
                            n.poster_name,
                            n.status,
                            n.quantity_required,
                            n.quantity_committed,
                            n.quantity_received,
                            n.created_at,
                            (n as Need & { completed_at?: string })
                              .completed_at,
                          ]),
                        );
                  downloadText(
                    text,
                    `bridge-${tab}-${from}-to-${to}.csv`,
                    "text/csv;charset=utf-8",
                  );
                }}
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
            <div className="report-table-wrap">
              <table>
                <thead>
                  <tr>
                    {(tab === "gifts"
                      ? [
                          "Donor / contribution",
                          "Received",
                          "Quantity",
                          "Funds",
                          "Receipt email",
                        ]
                      : [
                          "Need / posted by",
                          "County",
                          "Status",
                          "Received / requested",
                        ]
                    ).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab === "gifts"
                    ? gifts.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <strong>{g.donor_name}</strong>
                            <small>{g.description}</small>
                          </td>
                          <td>
                            {new Date(g.received_at).toLocaleDateString()}
                          </td>
                          <td>{g.quantity}</td>
                          <td>
                            {g.kind === "funds"
                              ? (Number(g.amount_cents) / 100).toLocaleString(
                                  "en-US",
                                  { style: "currency", currency: "USD" },
                                )
                              : "Noncash · no value assigned"}
                          </td>
                          <td>{g.receipt_status || "Not queued"}</td>
                        </tr>
                      ))
                    : data.needs.map((n) => (
                        <tr key={n.id}>
                          <td>
                            <strong>{n.title}</strong>
                            <small>{n.poster_name || orgName}</small>
                          </td>
                          <td>{n.service_area}</td>
                          <td>{n.status}</td>
                          <td>
                            {n.quantity_received || 0} /{" "}
                            {n.quantity_required || 1}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {(tab === "gifts" ? !gifts.length : !data.needs.length) && (
                <div className="empty-state">
                  <FileText size={27} />
                  <h3>No records in this period.</h3>
                  <p>
                    Confirmed donations appear here after a caseworker records
                    them. Promises are not counted as received gifts.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="annual-banner">
            <CalendarClock size={29} />
            <div>
              <h2>Year-end reports, automatically.</h2>
              <p>
                On January 1, the scheduled worker generates and emails each
                donor’s prior-year giving statement. Corrected gifts generate an
                updated statement without duplicating unchanged ones.
              </p>
              <small>
                {live
                  ? "Requires the five-minute worker and a configured EIN and email provider."
                  : "Demo only. No statements or emails are sent to real donors."}
              </small>
            </div>
          </div>
          <div className="report-filters">
            <label>
              Giving year
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {Array.from(
                  { length: 7 },
                  (_, i) => now.getFullYear() - 1 - i,
                ).map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const queued = live
                    ? (
                        await api<{ queued: number }>(
                          "generate-annual-reports",
                          { year },
                        )
                      ).queued
                    : generateDemoAnnual(year, orgName);
                  setMessage(
                    live
                      ? `${queued} new or updated donor statements queued for email.`
                      : `${queued} sample statements generated; no email sent.`,
                  );
                  await annual();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Mail size={16} />
              Generate & queue statements
            </button>
          </div>
          <div className="admin-panel report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Year</th>
                  <th>Funds received</th>
                  <th>Email status</th>
                  <th>Statement</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.snapshot.donor_name}</strong>
                      <small>{s.snapshot.donor_email}</small>
                    </td>
                    <td>{s.year}</td>
                    <td>
                      {(Number(s.snapshot.cash_cents) / 100).toLocaleString(
                        "en-US",
                        { style: "currency", currency: "USD" },
                      )}
                    </td>
                    <td>{s.email_status}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            const text = live
                              ? (
                                  await api<{ text: string }>(
                                    "annual-statement",
                                    { id: s.id },
                                  )
                                ).text
                              : "DEMO — NOT A TAX RECEIPT\n" +
                                buildAnnualStatement(s.snapshot);
                            downloadText(text, `bridge-${s.year}-statement.txt`);
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <Download size={15} />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!statements.length && (
              <div className="empty-state">
                <CalendarClock size={27} />
                <h3>No statements for {year} yet.</h3>
                <p>
                  Statements include only donors with confirmed, recorded
                  contributions in that year.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
