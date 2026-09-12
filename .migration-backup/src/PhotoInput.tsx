import { useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { api, live, supabase } from "./client";
export type PhotoAsset = {
  path: string | null;
  url: string | null;
  alt: string;
};
export default function PhotoInput({
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  value: PhotoAsset;
  onChange: (asset: PhotoAsset) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function choose(file: File) {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5242880
      )
        throw new Error("Choose a JPEG, PNG, or WebP photo under 5 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Photo processing is unavailable.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Could not process this photo.")),
          "image/jpeg",
          0.82,
        ),
      );
      let path: string | null = null;
      const url = canvas.toDataURL("image/jpeg", 0.82);
      if (live) {
        if (!supabase) throw new Error("Storage is not connected.");
        const ticket = await api<{ path: string; token: string }>(
          "photo-upload",
          { type: "image/jpeg", size: blob.size },
        );
        const { error } = await supabase.storage
          .from("need-photos")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, {
            contentType: "image/jpeg",
          });
        if (error) throw error;
        path = ticket.path;
      }
      onChange({ path, url, alt: value.alt });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="photo-input">
      <div className="photo-input-label">
        <Camera size={17} />
        <strong>Specific need photo</strong>
        <span>Optional</span>
      </div>
      {value.url && (
        <div className="photo-preview">
          <img
            src={value.url}
            alt={value.alt || "Photo selected for this need"}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Remove selected photo"
            disabled={busy || disabled}
            onClick={() => onChange({ path: null, url: null, alt: "" })}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <label className="photo-upload">
        <Upload size={16} />
        {busy
          ? "Preparing photo…"
          : value.url
            ? "Choose a different photo"
            : "Upload a photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void choose(f);
            e.target.value = "";
          }}
        />
      </label>
      <p>
        Use the specific item or a reference photo, without faces, family names,
        or private addresses. Location metadata is removed.
      </p>
      {value.url && (
        <label>
          Describe the photo
          <input
            value={value.alt}
            required
            maxLength={200}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
            placeholder="e.g. A three-drawer white dresser"
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
