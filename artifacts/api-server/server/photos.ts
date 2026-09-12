import { one, type DB } from "./db";
import { HttpError } from "./http";
import { downloadPhoto, signedPhotoUrls } from "./platform";
export function validPhotoBytes(bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const webp =
    Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.slice(8, 12)).toString() === "WEBP";
  return jpeg || png || webp;
}
export async function validatePhoto(
  db: DB,
  org: string,
  user: string,
  path: string,
) {
  if (!path.startsWith(`${org}/${user}/`) || path.includes(".."))
    throw new HttpError(
      403,
      "This upload does not belong to your organization and account.",
    );
  await one(
    db
      .from("need_photo_uploads")
      .select("path")
      .eq("organization_id", org)
      .eq("uploaded_by", user)
      .eq("path", path)
      .single(),
  );
  const blob = await downloadPhoto(path);
  if (
    blob.size > 5242880 ||
    !validPhotoBytes(new Uint8Array(await blob.arrayBuffer()))
  )
    throw new HttpError(
      400,
      "Choose a JPEG, PNG, or WebP photo smaller than 5 MB.",
    );
}
export async function needPhotoUrls(
  db: DB,
  needs: { photo_path?: string | null; photo_approved_at?: string | null }[],
  staff: boolean,
) {
  const paths = needs
    .filter((n) => n.photo_path && (staff || n.photo_approved_at))
    .map((n) => n.photo_path!);
  if (!paths.length) return new Map<string, string>();
  const data = await signedPhotoUrls([...new Set(paths)]);
  return new Map(
    (data || [])
      .filter((x) => x.signedUrl && x.path)
      .map((x) => [x.path!, x.signedUrl]),
  );
}
