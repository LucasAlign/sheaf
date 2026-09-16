import { useState } from "react";
import { MapPin, UserRound, ShieldCheck, Heart } from "lucide-react";
import type { Need, Profile } from "./types";
import Modal from "./Modal";
import AdminNeedDetails from "./AdminNeedDetails";
import NeedProgress, { needCounts } from "./NeedProgress";
import FulfillmentPanel from "./FulfillmentPanel";
import PhotoInput, { type PhotoAsset } from "./PhotoInput";
import { api, live } from "./client";
export default function NeedDialog({
  need,
  known,
  profile,
  busy,
  admin,
  close,
  claim,
  onChange,
  updateNeed,
}: {
  need: Need;
  known: boolean;
  profile: Profile;
  busy: boolean;
  admin: boolean;
  close: () => void;
  claim: (
    n: Need,
    w: string,
    e?: string,
    name?: string,
    quantity?: number,
  ) => Promise<void>;
  onChange: () => void | Promise<void>;
  updateNeed: (n: Need) => void;
}) {
  const [way, setWay] = useState(need.ways_to_help[0]),
    [quantity, setQuantity] = useState(1),
    [required, setRequired] = useState(need.quantity_required || 1),
    [problem, setProblem] = useState(""),
    [working, setWorking] = useState(false);
  const [photo, setPhoto] = useState<PhotoAsset>({
    path: need.photo_path || null,
    url: need.photo_url || null,
    alt: need.photo_alt || "",
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  const counts = needCounts(need);
  async function edit(fn: () => Promise<void>) {
    setWorking(true);
    setProblem("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal title={need.title} close={close}>
      {need.photo_url && (
        <img
          className="need-detail-photo"
          src={need.photo_url}
          alt={need.photo_alt || need.title}
        />
      )}
      <div className="detail-meta">
        <span className={"urgency " + need.urgency}>
          {need.urgency === "critical"
            ? "Urgent"
            : need.urgency === "soon"
              ? "Needed soon"
              : "Flexible"}
        </span>
        <span>
          <MapPin size={15} />
          {need.service_area} County
        </span>
      </div>
      <p>{need.description}</p>
      <div className="need-posting">
        <div>
          <MapPin size={17} />
          <span>
            <small>Location</small>
            <strong>
              {need.public_location ||
                need.service_area + " County, Pennsylvania"}
            </strong>
          </span>
        </div>
        <div>
          <UserRound size={17} />
          <span>
            <small>Posted by</small>
            <strong>
              {need.poster_name || "Keystone Family Alliance caseworker"}
            </strong>
          </span>
        </div>
      </div>
      <p className="privacy-note">
        <ShieldCheck size={17} />
        The public location is a town or meeting point. Family addresses are
        shared privately.
      </p>
      <NeedProgress need={need} />
      <p className="subtle">
        Needed by {new Date(need.needed_by).toLocaleDateString()}
      </p>
      {admin && need.status === "open" && <AdminNeedDetails need={need} />}
      {(admin || need.claimed_by_me) && (
        <FulfillmentPanel need={need} admin={admin} onChange={onChange} />
      )}
      {need.status === "open" && !admin && !need.claimed_by_me && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void claim(
              need,
              way,
              String(f.get("email") || profile.email),
              String(f.get("name") || profile.name),
              quantity,
            );
          }}
        >
          <fieldset>
            <legend>How would you like to help?</legend>
            {need.ways_to_help.map((w) => (
              <label className="radio-row" key={w}>
                <input
                  type="radio"
                  name="way"
                  checked={way === w}
                  onChange={() => setWay(w)}
                />
                {w}
              </label>
            ))}
          </fieldset>
          {counts.required > 1 && (
            <label>
              How many {need.unit_label || "items"} can you provide?
              <input
                type="number"
                min="1"
                max={counts.available}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </label>
          )}
          {!known && (
            <>
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <p>
                No account or password needed. We’ll send a secure confirmation
                link.
              </p>
            </>
          )}
          <button className="button primary full" disabled={busy}>
            {known
              ? "I can provide " + quantity + " " + (need.unit_label || "item")
              : "Email my secure claim link"}
            <Heart size={17} />
          </button>
        </form>
      )}
      {admin && (
        <details className="need-edit">
          <summary>Update requested quantity or photo</summary>
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void edit(async () => {
                if (required < counts.committed)
                  throw new Error(
                    "Release unprovided commitments before reducing the requested total.",
                  );
                if (live)
                  await api("update-quantity", {
                    need_id: need.id,
                    quantity: required,
                  });
                else updateNeed({ ...need, quantity_required: required });
              });
            }}
          >
            <label>
              Quantity requested
              <input
                type="number"
                min={Math.max(1, counts.committed)}
                max="10000"
                value={required}
                onChange={(e) => setRequired(Number(e.target.value))}
                required
              />
            </label>
            <button
              className="button secondary full"
              disabled={working || photoBusy}
            >
              Update quantity
            </button>
          </form>
          <PhotoInput
            value={photo}
            onChange={setPhoto}
            onBusyChange={setPhotoBusy}
            disabled={working || photoBusy}
          />
          <button
            className="button secondary full"
            disabled={working || photoBusy}
            onClick={() =>
              edit(async () => {
                if (photo.url && !photo.alt)
                  throw new Error("Describe the photo before attaching it.");
                if (live)
                  await api("attach-photo", {
                    need_id: need.id,
                    path: photo.path,
                    alt: photo.alt,
                  });
                else
                  updateNeed({
                    ...need,
                    photo_url: photo.url,
                    photo_path: photo.path,
                    photo_alt: photo.alt,
                    photo_approved_at: photo.path
                      ? new Date().toISOString()
                      : null,
                  });
              })
            }
          >
            Save and publish photo
          </button>
        </details>
      )}
    </Modal>
  );
}
