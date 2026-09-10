import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Need } from "./types";
import { api, live } from "./client";
type Match = {
  volunteer_id: string;
  name: string;
  score: number;
  reasons: string[];
  frequency: string;
};
export default function AdminNeedDetails({ need }: { need: Need }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!live) {
          setMatches(
            need.status === "open"
              ? [
                  {
                    volunteer_id: "sample-jordan",
                    name: "Jordan M. · Sample volunteer",
                    score: 78,
                    reasons: ["Fits how they like to help", "3.2 miles away"],
                    frequency: "instant",
                  },
                  {
                    volunteer_id: "sample-sam",
                    name: "Sam R. · Sample volunteer",
                    score: 64,
                    reasons: ["Fits how they like to help", "8.1 miles away"],
                    frequency: "digest",
                  },
                ]
              : [],
          );
          return;
        }
        if (need.status === "open") {
          const d = await api<{ matches: Match[] }>("need-matches", {
            need_id: need.id,
          });
          if (active) setMatches(d.matches);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [need.id, need.status]);
  return (
    <section className="admin-need-details">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading coordination details…</p>
      ) : (
        <>
          <h3>
            <Sparkles size={17} />
            Volunteer matches
          </h3>
          {matches.length ? (
            matches.map((m) => (
              <div className="match-person" key={m.volunteer_id}>
                <div>
                  <strong>{m.name}</strong>
                  <span>{m.reasons.join(" · ")}</span>
                  <small>
                    {m.frequency === "off"
                      ? "Match emails off"
                      : m.frequency === "digest"
                        ? "Daily digest"
                        : "Individual match emails"}
                  </small>
                </div>
                <b>
                  {Math.round(Number(m.score))}
                  <small>score</small>
                </b>
              </div>
            ))
          ) : (
            <p>
              {need.status === "pending"
                ? "Matching begins after this need is verified."
                : "No volunteer profiles match yet. Invite volunteers to build your circle of care."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
