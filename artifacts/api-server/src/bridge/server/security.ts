import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http';
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function emailSigningSecret() {
 const configured = process.env.LINK_SIGNING_SECRET;
 if (configured) return configured;
 if (process.env.BRIDGE_EMAIL_TRANSPORT === 'capture' && process.env.NODE_ENV !== 'production' && process.env.SESSION_SECRET) {
  return createHmac('sha256',process.env.SESSION_SECRET).update('bridge:staging:link-signing:v1').digest('hex');
 }
 return '';
}
export function emailClaimToken(secret:string,notificationId:string,needId:string) { if(secret.length<32)throw new HttpError(503,'Email claim links are not configured.');return createHmac('sha256',secret).update(`sheaf-claim:${notificationId}:${needId}`).digest('base64url'); }
export function constantEqual(a: string, b: string) { const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right); }
export function checkOrigin(origin: string | undefined, appUrl: string) { if (!origin || origin !== new URL(appUrl).origin) throw new HttpError(403,'Please submit this request from your Bridge portal.'); }
export function sessionCookie(token: string, secure: boolean) { return `sheaf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`; }
export function readSession(cookie: string | undefined) { const value = cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('sheaf_session='))?.slice(14); return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null; }
export function escapeHtml(value: string) { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
