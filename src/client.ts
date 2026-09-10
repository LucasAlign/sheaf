import { createClient } from '@supabase/supabase-js';
export const live = import.meta.env.VITE_DATA_MODE === 'live';
export const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null;
export async function api<T>(action: string, body?: unknown): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const response = await fetch(`/api/portal?action=${encodeURIComponent(action)}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result as T;
}
