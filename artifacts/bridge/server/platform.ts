import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

let client: ReturnType<typeof createClient> | null | undefined;
function platform() {
  if (client !== undefined) return client;
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
function required() {
  const value = platform();
  if (!value) throw new HttpError(503, "Staff sign-in and photo storage are not connected yet.");
  return value;
}
export async function verifyStaffToken(token: string) {
  const { data, error } = await required().auth.getUser(token);
  if (error) throw new HttpError(401, "Your sign-in expired. Please sign in again.");
  return data.user.id;
}
export async function staffEmail(userId: string, legacyDatabase?: any) {
  const auth = legacyDatabase?.auth || required().auth;
  const { data, error } = await auth.admin.getUserById(userId);
  if (error) throw new HttpError(500, "Could not find the posting caseworker.");
  return data.user?.email || null;
}
export async function createPhotoUpload(path: string) {
  const { data, error } = await required().storage.from("need-photos").createSignedUploadUrl(path);
  if (error) throw new HttpError(500, "Could not prepare the photo upload.");
  return data;
}
export async function downloadPhoto(path: string) {
  const { data, error } = await required().storage.from("need-photos").download(path);
  if (error) throw new HttpError(404, "Photo not found.");
  return data;
}
export async function signedPhotoUrls(paths: string[]) {
  const { data, error } = await required().storage.from("need-photos").createSignedUrls(paths, 900);
  if (error) throw new HttpError(500, "Could not load need photos.");
  return data;
}
