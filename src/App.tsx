import BridgeWordmark from "./BridgeWordmark";
import BridgeMark from "./BridgeMark";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  Clock3,
  Heart,
  HelpingHand,
  Leaf,
  MapPin,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Truck,
  UserRound,
  Utensils,
  Wallet,
  X,
  LogOut,
  Mail,
  Download,
} from "lucide-react";
import { api, live, supabase } from "./client";
import { demoNeeds, demoOrg } from "./demo";
import {
  categories,
  emptyProfile,
  type Category,
  type Need,
  type Organization,
  type Profile,
} from "./types";
import { rankDemo } from "./matching";
import { counties } from "./counties";
import { browserRegistry, registerSheafTools } from "./webmcp";
import Modal, { FeedbackContext } from "./Modal";
import NeedDialog from "./NeedDialog";
import NeedProgress, { needCounts } from "./NeedProgress";
import PhotoInput, { type PhotoAsset } from "./PhotoInput";
import Reports from "./Reports";
import {
  demoClaim,
  syncDemoNeeds,
  hydrateDemoNeeds,
  resetDemoRecords,
} from "./demoRecords";
import AdminDashboard, { type AdminTab } from "./AdminDashboard";

const icons = {
  goods: Box,
  transportation: Truck,
  meals: Utensils,
  "helping hands": HelpingHand,
  funds: Wallet,
};
const labels = {
  goods: "Goods",
  transportation: "Transportation",
  meals: "Meals",
  "helping hands": "Helping hands",
  funds: "Funds",
};
const urgencyLabels = {
  critical: "Urgent",
  soon: "Needed soon",
  flexible: "Flexible",
};
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function CategoryIcon({
  category,
  small = false,
}: {
  category: Category;
  small?: boolean;
}) {
  const Icon = icons[category];
  return (
    <span
      className={`category-icon ${category.replace(" ", "-")} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 18 : 25} strokeWidth={1.6} />
    </span>
  );
}

export default function App() {
  const [needs, setNeeds] = useState<Need[]>(() =>
    live ? [] : hydrateDemoNeeds(readLocal("sheaf-demo-needs-v2", demoNeeds)),
  );
  const [org, setOrg] = useState<Organization>(demoOrg);
  const [profile, setProfile] = useState<Profile>(() =>
    live ? emptyProfile : readLocal("sheaf-demo-profile", emptyProfile),
  );
  const [known, setKnown] = useState(
    !live && !!readLocal<Profile>("sheaf-demo-profile", emptyProfile).email,
  );
  const [view, setView] = useState<"feed" | "mine" | "admin">(() =>
    new URLSearchParams(location.search).get("view") === "feed" ||
    new URLSearchParams(location.hash.slice(1)).has("token")
      ? "feed"
      : "admin",
  );
  const [admin, setAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    "profile" | "login" | "post" | "how" | "invite" | null
  >(null);
  const [selected, setSelected] = useState<Need | null>(null);
  const [category, setCategory] = useState<Category | "all">("all");
  const [urgency, setUrgency] = useState("all");
  const [county, setCounty] = useState("all");
  const [distance, setDistance] = useState("all");
  const [query, setQuery] = useState("");
  const [waysChoice, setWaysChoice] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("newest");
  const [dark, setDark] = useState(() => readLocal("sheaf-dark", false));
  const [token, setToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("token"),
  );
  const [claimTarget, setClaimTarget] = useState<string | null>(() =>
    new URLSearchParams(location.hash.slice(1)).get("need"),
  );
  useEffect(() => {
    if (token) history.replaceState(null, "", location.pathname);
  }, [token]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("sheaf-dark", JSON.stringify(dark));
  }, [dark]);
  useEffect(() => {
    if (!live) {
      localStorage.setItem("sheaf-demo-needs-v2", JSON.stringify(needs));
      localStorage.setItem("sheaf-demo-profile", JSON.stringify(profile));
    }
  }, [needs, profile]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  async function refresh() {
    if (!live) return;
    try {
      const result = await api<{
        needs: Need[];
        org: Organization;
        profile: Profile | null;
        admin: boolean;
      }>("feed");
      setNeeds(result.needs);
      setOrg(result.org);
      setAdmin(result.admin);
      setKnown(!!result.profile);
      setProfile(result.profile || emptyProfile);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    if (!live) return;
    const id = setInterval(refresh, 45000);
    const sub = supabase?.auth.onAuthStateChange(() => {
      setTimeout(refresh, 0);
    });
    return () => {
      clearInterval(id);
      sub?.data.subscription.unsubscribe();
    };
  }, []);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(
    () =>
      registerSheafTools(
        browserRegistry(),
        (id) => {
          const need = needs.find((n) => n.id === id);
          if (need) setSelected(need);
        },
        needs.map((n) => n.id),
      ),
    [needs],
  );
  const open = needs.filter((n) => n.status === "open" && n.approved_at);
  const matches = (
    live
      ? [...open]
          .filter((n) => n.score !== undefined)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
      : rankDemo(open, profile)
  ).slice(0, 3);
  const filtered = (
    view === "mine" ? needs.filter((n) => n.claimed_by_me) : open
  )
    .filter(
      (n) =>
        (category === "all" || n.category === category) &&
        (urgency === "all" || n.urgency === urgency) &&
        (county === "all" || n.service_area === county) &&
        (distance === "all" ||
          (n.distance !== undefined && n.distance <= +distance)) &&
        `${n.title} ${n.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "nearest"
        ? (a.distance ?? Infinity) - (b.distance ?? Infinity)
        : sort === "urgent"
          ? ["critical", "soon", "flexible"].indexOf(a.urgency) -
            ["critical", "soon", "flexible"].indexOf(b.urgency)
          : b.created_at.localeCompare(a.created_at),
    );
  const resetFilters = () => {
    setCategory("all");
    setUrgency("all");
    setCounty("all");
    setDistance("all");
    setQuery("");
  };
  async function claim(
    need: Need,
    way: string,
    email?: string,
    name?: string,
    quantity = 1,
  ) {
    await act(async () => {
      if (live) {
        if (!known) {
          await api("magic-link", {
            email,
            name,
            need_id: need.id,
            way,
            quantity,
          });
          setSelected(null);
          setToast("Check your email for a secure link to confirm your help.");
          return;
        }
        await api("claim", { need_id: need.id, way, quantity });
        await refresh();
      } else {
        demoClaim(
          need,
          quantity,
          {
            ...profile,
            name: name || profile.name,
            email: email || profile.email,
          },
          way,
        );
        setNeeds((ns) => syncDemoNeeds(ns));
        if (!known) {
          setProfile((p) => ({ ...p, email: email || "", name: name || "" }));
          setKnown(true);
        }
      }
      setSelected(null);
      setToast(
        live
          ? "You’re on it! Your caseworker will coordinate the next steps."
          : "Sample need claimed. Find it in My help.",
      );
    });
  }
  async function recordsChanged() {
    if (live) await refresh();
    else setNeeds((ns) => syncDemoNeeds(ns));
  }
  useEffect(() => {
    setSelected((previous) =>
      previous ? needs.find((n) => n.id === previous.id) || null : null,
    );
  }, [needs]);
  function enterAdmin() {
    if (!live || admin) {
      setView("admin");
      resetFilters();
    } else setModal("login");
  }
  const count = needs.filter(
    (n) => n.claimed_by_me && n.status === "claimed",
  ).length;
  return (
    <FeedbackContext.Provider value={{ error, toast }}>
      <a href="#main" className="skip-link">
        Skip to needs
      </a>
      {!live && (
        <div className="demo-banner">
          <span>
            <span className="tiny-dot" /> Interactive preview · Sample needs,
            saved on this device
          </span>
          <button
            onClick={() => {
              resetDemoRecords();
              setNeeds(hydrateDemoNeeds(demoNeeds));
              setProfile(emptyProfile);
              setKnown(false);
              setToast("Preview reset.");
            }}
          >
            Reset demo <ArrowRight size={12} />
          </button>
        </div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            aria-label="Bridge home"
            onClick={() => {
              setView("admin");
              resetFilters();
            }}
          >
            <BridgeWordmark />
          </button>
          <div className="brand-divider" />
          <div className="org-lockup">
            <span>A COMMUNITY OF CARE</span>
            <strong>{org.name}</strong>
          </div>
          {view === "admin" ? (
            <nav aria-label="Admin navigation">
              <button
                className={adminTab === "overview" ? "active" : ""}
                onClick={() => setAdminTab("overview")}
              >
                Overview
              </button>
              <button
                className={adminTab === "pipeline" ? "active" : ""}
                onClick={() => setAdminTab("pipeline")}
              >
                Needs pipeline
              </button>
              <button
                className={adminTab === "outreach" ? "active" : ""}
                onClick={() => setAdminTab("outreach")}
              >
                Email outreach
              </button>
              <button
                className={adminTab === "reports" ? "active" : ""}
                onClick={() => setAdminTab("reports")}
              >
                Reports
              </button>
            </nav>
          ) : (
            <nav aria-label="Main navigation">
              <button
                className={view === "feed" ? "active" : ""}
                onClick={() => setView("feed")}
              >
                Find a need
              </button>
              <button
                className={view === "mine" ? "active" : ""}
                onClick={() => {
                  setView("mine");
                  resetFilters();
                }}
              >
                My help{" "}
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
              <button onClick={() => setModal("how")}>How it works</button>
            </nav>
          )}
          <div className="header-actions">
            <button
              className="icon-button theme-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="profile-button"
              onClick={() =>
                view === "admin" ? setView("feed") : setModal("profile")
              }
            >
              <UserRound size={17} />
              <span>
                {view === "admin"
                  ? "Community feed"
                  : profile.name
                    ? profile.name.split(" ")[0]
                    : "Your profile"}
              </span>
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="page">
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              onClick={() => {
                setError("");
                void refresh();
              }}
            >
              Try again
            </button>
          </div>
        )}
        {view === "admin" ? (
          <>
            {live && !admin ? (
              <div className="admin-welcome">
                <ShieldCheck size={35} />
                <div className="eyebrow">KEYSTONE FAMILY ALLIANCE</div>
                <h1>Welcome to your workspace.</h1>
                <p>
                  Sign in to post needs, coordinate thoughtful email outreach,
                  and follow every act of care through.
                </p>
                <button
                  className="button primary"
                  onClick={() => setModal("login")}
                >
                  Staff sign in <ArrowRight size={17} />
                </button>
                <button className="text-button" onClick={() => setView("feed")}>
                  Here to help? Browse the community feed{" "}
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : adminTab === "reports" ? (
              <Reports needs={needs} orgName={org.name} />
            ) : (
              <AdminDashboard
                needs={needs}
                tab={adminTab}
                setTab={setAdminTab}
                busy={busy}
                post={() => setModal("post")}
                invite={() => setModal("invite")}
                select={setSelected}
                remind={(n) =>
                  act(async () => {
                    if (live) await api("remind", { need_id: n.id });
                    setToast(
                      live
                        ? "Reminder queued for the volunteer."
                        : "Sample reminder recorded. No email sent.",
                    );
                  })
                }
              />
            )}
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="tiny-dot" /> SHOW UP FOR A FAMILY
                </div>
                <h1>
                  {view === "mine" ? (
                    "Your kindness, in motion."
                  ) : (
                    <>
                      Small acts. <em>Lasting belonging.</em>
                    </>
                  )}
                </h1>
                <p>
                  {view === "mine"
                    ? "The needs you’ve taken to heart, all in one place."
                    : "A meal. A ride. A place to rest. Make a difference close to home."}
                </p>
              </div>
              <button
                className="location-button"
                onClick={() => setModal("profile")}
              >
                <MapPin size={18} />
                <span>
                  <small>Your community</small>
                  {profile.location || "Pennsylvania"}
                </span>
                <ChevronDown size={15} />
              </button>
            </div>
            {view === "feed" && (
              <section className="match-section" aria-labelledby="match-title">
                <div className="section-top">
                  <div className="section-label">
                    <Sparkles size={19} />
                    <h2 id="match-title">
                      {known ? "Matched for you" : "A good place to start"}
                    </h2>
                    <span className="subtle">
                      {known
                        ? "A little closer to what you do best"
                        : "A few needs to take to heart"}
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal("profile")}
                  >
                    {known ? "Fine-tune your matches" : "Make it personal"}{" "}
                    <ArrowRight size={15} />
                  </button>
                </div>
                {matches.length ? (
                  <div className="match-grid">
                    {matches.map((n) => (
                      <button
                        className="match-card"
                        key={n.id}
                        onClick={() => setSelected(n)}
                      >
                        <div className="match-title">
                          <CategoryIcon category={n.category} small />
                          <span>{labels[n.category]}</span>
                          {n.urgency === "critical" && (
                            <span className="match-urgent">Urgent</span>
                          )}
                        </div>
                        <h3>{n.title}</h3>
                        <div className="match-bottom">
                          <span>
                            <Check size={13} />
                            {n.reasons?.[0] || "Posted by approved staff"}
                          </span>
                          <ArrowRight size={18} />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="match-empty">
                    {loading
                      ? "Finding needs in your community…"
                      : "New needs from approved staff will appear here. Set your profile to help us find a good fit."}
                  </div>
                )}
              </section>
            )}
            <section className="feed-section" aria-labelledby="feed-title">
              <div className="feed-heading">
                <div>
                  <h2 id="feed-title">
                    {view === "mine"
                      ? "Your commitments"
                      : "Find your way to help"}{" "}
                    <span>{filtered.length}</span>
                  </h2>
                  <p>
                    {view === "mine"
                      ? "Your caseworker coordinates the details privately."
                      : "Every need comes from approved staff. Every act of care matters."}
                  </p>
                </div>
                <div className="verified-note">
                  <ShieldCheck size={17} />
                  <span>Posted by approved staff</span>
                </div>
              </div>
              <div className="category-tabs" aria-label="Filter by category">
                <button
                  className={category === "all" ? "selected" : ""}
                  onClick={() => setCategory("all")}
                >
                  <Heart size={16} /> All needs{" "}
                  <span>
                    {view === "mine"
                      ? needs.filter((n) => n.claimed_by_me).length
                      : open.length}
                  </span>
                </button>
                {categories.map((c) => {
                  const Icon = icons[c];
                  return (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      <Icon size={17} />
                      {labels[c]}
                    </button>
                  );
                })}
              </div>
              <div className="filter-row">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search needs"
                    placeholder="Search for a way to help…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="filter-controls">
                  <SlidersHorizontal size={17} className="filter-icon" />
                  <label>
                    <span className="sr-only">Urgency</span>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                    >
                      <option value="all">Any urgency</option>
                      <option value="critical">Urgent</option>
                      <option value="soon">Needed soon</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">County</span>
                    <select
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                    >
                      <option value="all">All counties</option>
                      {counties.map((c) => (
                        <option key={c} value={c}>
                          {c} County
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Distance</span>
                    <select
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                    >
                      <option value="all">Any distance</option>
                      <option value="5">Within 5 miles</option>
                      <option value="15">Within 15 miles</option>
                      <option value="30">Within 30 miles</option>
                      <option value="60">Within 60 miles</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="results-row">
                <span>
                  {filtered.length}{" "}
                  {view === "mine"
                    ? "commitments"
                    : "opportunities to make someone’s day"}
                  {!live && " · Sample data"}
                </span>
                <label>
                  <ArrowDownUp size={14} />
                  <span className="sr-only">Sort needs</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="urgent">Most urgent</option>
                    <option value="nearest">Nearest first</option>
                  </select>
                </label>
              </div>
              {loading ? (
                <div className="empty-state">
                  Loading your community’s needs…
                </div>
              ) : filtered.length ? (
                <div className="need-grid">
                  {filtered.map((n) => (
                    <article className="need-card" key={n.id}>
                      <div className="card-top">
                        <CategoryIcon category={n.category} />
                        <span className={`urgency ${n.urgency}`}>
                          <span />
                          {n.status === "completed"
                            ? "Completed"
                            : urgencyLabels[n.urgency]}
                        </span>
                      </div>
                      {n.photo_url && n.photo_approved_at && (
                        <img
                          className="need-card-photo"
                          src={n.photo_url}
                          alt={n.photo_alt || n.title}
                          loading="lazy"
                        />
                      )}
                      <div className="card-category">{labels[n.category]}</div>
                      <h3>
                        <button onClick={() => setSelected(n)}>
                          {n.title}
                        </button>
                      </h3>
                      <p className="card-description">{n.description}</p>
                      <p className="posted-by">
                        Posted by {n.poster_name || org.name}
                      </p>
                      <p className="public-location">
                        {n.public_location || n.service_area + " County"}
                      </p>
                      <NeedProgress need={n} />
                      <div className="need-meta">
                        <span>
                          <MapPin size={14} />
                          {n.service_area} County
                          {n.distance !== undefined &&
                            ` · ${n.distance.toFixed(1)} mi`}
                        </span>
                        <span>
                          <Clock3 size={14} />
                          By {date(n.needed_by)}
                        </span>
                      </div>
                      <div className="ways">
                        <span>WAYS TO HELP</span>
                        <div>
                          {n.ways_to_help.map((w) => (
                            <button
                              key={w}
                              aria-pressed={
                                (waysChoice[n.id] || n.ways_to_help[0]) === w
                              }
                              onClick={() =>
                                setWaysChoice((previous) => ({
                                  ...previous,
                                  [n.id]: w,
                                }))
                              }
                            >
                              {w}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="card-footer">
                        <span>
                          <ShieldCheck size={15} /> Verified need
                        </span>
                        <button
                          className={`button ${n.claimed_by_me ? "secondary" : "primary"}`}
                          disabled={busy}
                          onClick={() =>
                            n.claimed_by_me
                              ? setSelected(n)
                              : known && needCounts(n).required === 1
                                ? claim(
                                    n,
                                    waysChoice[n.id] || n.ways_to_help[0],
                                  )
                                : setSelected(n)
                          }
                        >
                          {n.claimed_by_me ? "View my help" : "I can help"}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Leaf size={32} />
                  <h3>
                    {view === "mine"
                      ? "Your next act of care starts here."
                      : "No needs match these filters."}
                  </h3>
                  <p>
                    {view === "mine"
                      ? "Claim a need and it will appear here."
                      : distance !== "all" && profile.latitude === null && live
                        ? "Add your location to your profile to filter by distance."
                        : "Try a different category or a wider area."}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      resetFilters();
                      setView("feed");
                    }}
                  >
                    Explore all needs <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
            {view === "feed" && (
              <section className="care-note">
                <span className="care-emblem">
                  <BridgeMark size={35} />
                </span>
                <div>
                  <h2>You don’t have to do everything.</h2>
                  <p>Just the next kind thing. We’ll help you find it.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("profile")}
                >
                  Find where you fit <ArrowRight size={16} />
                </button>
              </section>
            )}
          </>
        )}
        <footer>
          <div>
            <BridgeMark size={20} />
            <span>Little by little. Together.</span>
          </div>
          <span>Bridge · {org.name}</span>
          <button
            onClick={() => (view === "admin" ? setView("feed") : enterAdmin())}
          >
            {view === "admin" ? "Community feed" : "Staff portal"}{" "}
            <ArrowRight size={13} />
          </button>
          {admin && (
            <button
              onClick={async () => {
                await supabase?.auth.signOut();
                setAdmin(false);
                setView("feed");
              }}
            >
              Sign out <LogOut size={13} />
            </button>
          )}
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={20} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "how" && (
        <Modal
          title="One small yes can change a day."
          close={() => setModal(null)}
        >
          <div className="how-steps">
            {[
              [
                "Find your fit",
                "Browse needs posted by approved staff, or add a profile for more personal matches.",
              ],
              [
                "Say “I can help”",
                "Choose how you’ll help. New volunteers confirm through a secure email link; returning volunteers can claim in one tap.",
              ],
              [
                "Show up with care",
                "A caseworker coordinates the details privately, then confirms when the need is complete.",
              ],
            ].map(([t, d], i) => (
              <div key={t}>
                <span>{i + 1}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="privacy-note">
            <ShieldCheck size={17} />
            Family names, addresses, and sensitive details stay off the public
            feed.
          </p>
          <button
            className="button primary full"
            onClick={() => setModal(null)}
          >
            Find a need <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {modal === "profile" && (
        <ProfileForm
          profile={profile}
          known={known}
          busy={busy}
          close={() => setModal(null)}
          save={(p) =>
            act(async () => {
              if (live) {
                if (!known) {
                  await api("magic-link", { email: p.email, name: p.name });
                  setModal(null);
                  setToast(
                    "Check your email to securely open your profile. Then save your preferences.",
                  );
                  return;
                }
                await api("profile", p);
                await refresh();
              } else {
                setProfile(p);
                setKnown(!!p.email);
              }
              setModal(null);
              setToast(
                "Your profile is saved. Your matches will grow with you.",
              );
            })
          }
        />
      )}
      {modal === "invite" && (
        <Modal
          title="One more person in your circle."
          close={() => setModal(null)}
        >
          <p>
            Invite a volunteer to create their profile and choose whether they’d
            like matched emails.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                if (live)
                  await api("magic-link", {
                    name: String(f.get("name")),
                    email: String(f.get("email")),
                  });
                setModal(null);
                setToast(
                  live
                    ? "A secure profile invitation is on its way."
                    : "Sample invitation created. No email sent.",
                );
              });
            }}
          >
            <label>
              Volunteer name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Email address
              <input name="email" type="email" required maxLength={254} />
            </label>
            <label className="consent-row">
              <input type="checkbox" required /> This volunteer has asked to
              receive an invitation.
            </label>
            <button disabled={busy} className="button primary full">
              Send profile invitation <Mail size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "login" && (
        <Modal title="Staff sign in" close={() => setModal(null)}>
          <p>
            Use the email your organization approved for staff access.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                if (!supabase)
                  throw new Error("Supabase is not configured yet.");
                const { error } = await supabase.auth.signInWithOtp({
                  email: String(f.get("email")),
                  options: {
                    shouldCreateUser: false,
                    emailRedirectTo: location.origin,
                  },
                });
                if (error) throw error;
                setModal(null);
                setToast("Check your email for your sign-in link.");
              });
            }}
          >
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <button className="button primary full" disabled={busy}>
              Send secure sign-in link <Mail size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "post" && (
        <PostForm
          busy={busy}
          close={() => setModal(null)}
          save={(data) =>
            act(async () => {
              if (live) {
                await api("post", data);
                await refresh();
              } else
                setNeeds((ns) => [
                  {
                    ...data,
                    id: crypto.randomUUID(),
                    created_at: new Date().toISOString(),
                    approved_at: new Date().toISOString(),
                    status: "open",
                  },
                  ...ns,
                ]);
              setModal(null);
              setToast("Need posted and available to volunteers.");
            })
          }
        />
      )}
      {selected && (
        <NeedDialog
          need={selected}
          known={known}
          profile={profile}
          busy={busy}
          admin={view === "admin"}
          close={() => setSelected(null)}
          claim={claim}
          onChange={recordsChanged}
          updateNeed={(updated) =>
            setNeeds((ns) => ns.map((n) => (n.id === updated.id ? updated : n)))
          }
        />
      )}
      {token && (
        <Modal
          title="Your next kind thing."
          close={() => {
            setToken(null);
            setClaimTarget(null);
          }}
        >
          <p>
            {claimTarget
              ? "Confirm your email and claim this need. If someone has already stepped in, we’ll let you know."
              : "Confirm your email to open your volunteer profile securely."}
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api("redeem", { token });
                setToken(null);
                await refresh();
                if (claimTarget) {
                  setView("mine");
                  setToast(
                    "Email confirmed and need claimed. Thank you for stepping in.",
                  );
                } else {
                  setView("feed");
                  setModal("profile");
                }
                setClaimTarget(null);
              })
            }
          >
            {busy
              ? "Confirming…"
              : claimTarget
                ? "Confirm & claim this need"
                : "Confirm my email"}
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

function ProfileForm({
  profile,
  known,
  busy,
  close,
  save,
}: {
  profile: Profile;
  known: boolean;
  busy: boolean;
  close: () => void;
  save: (p: Profile) => void;
}) {
  const [tags, setTags] = useState(profile.capability_tags);
  const [geo, setGeo] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({ latitude: profile.latitude, longitude: profile.longitude });
  const [geoMessage, setGeoMessage] = useState("");
  return (
    <Modal title="A little about you. A better fit." close={close}>
      <p>
        Share what you can offer. We’ll help you find the needs that fit your
        life.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const start = String(f.get("start") || "");
          const end = String(f.get("end") || "");
          if (
            (start && !end) ||
            (!start && end) ||
            (start && end && start >= end)
          ) {
            setGeoMessage("Choose an availability end after the start.");
            return;
          }
          save({
            name: String(f.get("name")),
            email:
              profile.email && known ? profile.email : String(f.get("email")),
            location: String(f.get("location")),
            ...geo,
            capability_tags: tags,
            availability:
              start && end
                ? [
                    {
                      start: new Date(start).toISOString(),
                      end: new Date(end).toISOString(),
                    },
                  ]
                : [],
            frequency: String(f.get("frequency")) as Profile["frequency"],
            daily_cap: Number(f.get("cap")),
          });
        }}
      >
        <div className="form-grid">
          <label>
            Your name
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={profile.name}
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={profile.email}
              readOnly={known && live}
              autoComplete="email"
            />
          </label>
        </div>
        <label>
          Your county
          <select name="location" defaultValue={profile.location || ""}>
            <option value="">Choose a county</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c} County
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary full"
          type="button"
          onClick={() => {
            if (!navigator.geolocation) {
              setGeoMessage("Location is unavailable in this browser.");
              return;
            }
            setGeoMessage("Finding your location…");
            navigator.geolocation.getCurrentPosition(
              (p) => {
                setGeo({
                  latitude: Math.round(p.coords.latitude * 100) / 100,
                  longitude: Math.round(p.coords.longitude * 100) / 100,
                });
                setGeoMessage(
                  "Approximate location saved for distance matching.",
                );
              },
              () =>
                setGeoMessage(
                  "Location was unavailable. County browsing still works.",
                ),
              { timeout: 10000, enableHighAccuracy: false },
            );
          }}
        >
          <MapPin size={16} />
          {geo.latitude === null
            ? "Use my approximate location"
            : "Update my approximate location"}
        </button>
        {geo.latitude !== null && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setGeo({ latitude: null, longitude: null });
              setGeoMessage("Location removed.");
            }}
          >
            Remove location
          </button>
        )}
        {geoMessage && (
          <p role="status" className="subtle">
            {geoMessage}
          </p>
        )}
        <fieldset>
          <legend>I can help with</legend>
          <div className="tag-options">
            {categories.map((c) => (
              <label className={tags.includes(c) ? "checked" : ""} key={c}>
                <input
                  type="checkbox"
                  checked={tags.includes(c)}
                  onChange={() =>
                    setTags((t) =>
                      t.includes(c) ? t.filter((x) => x !== c) : [...t, c],
                    )
                  }
                />
                {labels[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Availability window <span className="subtle">(optional)</span>
          </legend>
          <div className="form-grid">
            <label>
              From
              <input
                type="datetime-local"
                name="start"
                defaultValue={
                  profile.availability[0]?.start
                    ? localDate(profile.availability[0].start)
                    : ""
                }
              />
            </label>
            <label>
              Until
              <input
                type="datetime-local"
                name="end"
                defaultValue={
                  profile.availability[0]?.end
                    ? localDate(profile.availability[0].end)
                    : ""
                }
              />
            </label>
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            Email preferences
            <select name="frequency" defaultValue={profile.frequency}>
              <option value="off">No match emails</option>
              <option value="instant">Individual matches</option>
              <option value="digest">Daily digest</option>
            </select>
          </label>
          <label>
            Maximum emails / day
            <select name="cap" defaultValue={profile.daily_cap}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} per day
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="privacy-note">
          <Bell size={17} />
          Only relevant matches, in small waves. You can change these
          preferences anytime. Claim confirmations still arrive.
        </p>
        <button className="button primary full" disabled={busy}>
          {busy
            ? "Saving…"
            : live && !known
              ? "Verify email to create profile"
              : "Save my profile"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function localDate(s: string) {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
const defaultWayToHelp: Record<Category, string> = {
  goods: "Provide the requested items",
  transportation: "Provide transportation",
  meals: "Provide a meal",
  "helping hands": "Help with this need",
  funds: "Contribute funds",
};
function PostForm({
  busy,
  close,
  save,
}: {
  busy: boolean;
  close: () => void;
  save: (n: Omit<Need, "id" | "created_at" | "approved_at" | "status">) => void;
}) {
  const [problem, setProblem] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photo, setPhoto] = useState<PhotoAsset>({
    path: null,
    url: null,
    alt: "",
  });
  return (
    <Modal title="A new way to show up." close={close}>
      <p>
        Describe the need without names, addresses, or identifying family
        details. Approved staff posts are published as soon as they are
        submitted.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const cat = String(f.get("category")) as Category;
          if (photo.url && !photo.alt) {
            setProblem("Describe the photo before submitting.");
            return;
          }
          save({
            title: String(f.get("title")),
            quantity_required: Number(f.get("quantity")),
            unit_label: String(f.get("unit")),
            public_location: String(f.get("public_location")),
            poster_name: String(f.get("poster_name")),
            photo_path: photo.path,
            photo_alt: photo.alt,
            ...(!live ? { photo_url: photo.url } : {}),
            category: cat,
            description: String(f.get("description")),
            urgency: String(f.get("urgency")) as Need["urgency"],
            service_area: String(f.get("county")),
            ways_to_help: [defaultWayToHelp[cat]],
            capability_tags: [cat],
            needed_by: new Date(
              String(f.get("needed_by")) + "T23:59:00",
            ).toISOString(),
            window_start: null,
            window_end: null,
          });
        }}
      >
        <label>
          Need title
          <input
            name="title"
            placeholder="e.g. A warm meal for a new foster family"
            maxLength={120}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select name="category">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {labels[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Urgency
            <select name="urgency">
              <option value="soon">Needed soon</option>
              <option value="critical">Urgent</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>
        </div>
        <label>
          What would help?
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            required
            placeholder="Share enough for a volunteer to say yes."
          />
        </label>
        <div className="form-grid">
          <label>
            Service county
            <select name="county" required>
              <option value="">Choose county</option>
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Needed by
            <input
              type="date"
              name="needed_by"
              min={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Quantity needed
            <input
              name="quantity"
              type="number"
              min="1"
              max="10000"
              defaultValue="1"
              required
            />
          </label>
          <label>
            Item / unit label
            <input
              name="unit"
              defaultValue="items"
              maxLength={40}
              placeholder="e.g. dressers"
              required
            />
          </label>
        </div>
        <label>
          Public location
          <input
            name="public_location"
            placeholder="e.g. State College — public pickup location"
            maxLength={200}
            required
          />
        </label>
        <label>
          Posted by (visible to volunteers)
          <input
            name="poster_name"
            placeholder="Your name and social worker / agency role"
            maxLength={100}
            required
          />
        </label>
        <PhotoInput
          value={photo}
          onChange={setPhoto}
          onBusyChange={setPhotoBusy}
          disabled={busy || photoBusy}
        />
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button disabled={busy || photoBusy} className="button primary full">
          {busy ? "Posting…" : "Post need"}
          <ShieldCheck size={17} />
        </button>
      </form>
    </Modal>
  );
}
