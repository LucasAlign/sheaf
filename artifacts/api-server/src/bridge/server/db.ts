import { createClient } from '@supabase/supabase-js';
import { HttpError, type Request } from './http';
import { hashToken,readSession } from './security';
import { postgresDatabase } from './postgres';
import { verifyStaffToken } from './platform';
export function config() {
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SHEAF_ORG_ID, APP_URL }=process.env;
  if((!DATABASE_URL&&(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY))||!SHEAF_ORG_ID||!APP_URL) throw new HttpError(503,'The live portal is not connected yet. Please contact the organization.');
  return {databaseUrl:DATABASE_URL,url:SUPABASE_URL,key:SUPABASE_SERVICE_ROLE_KEY,org:SHEAF_ORG_ID,appUrl:APP_URL};
}
export function database(): any { const c=config(); return c.databaseUrl ? postgresDatabase(c.databaseUrl) : createClient(c.url!,c.key!,{auth:{persistSession:false,autoRefreshToken:false}}); }
export type DB = ReturnType<typeof database>;
export async function result<T = any>(query: PromiseLike<{data:any;error:{message:string;code?:string}|null}>):Promise<T> {
 const {data,error}=await query;
 if(error) {
  const safe=['This need is no longer available','Choose a listed way to help','This link has expired or has already been used','This status change is not allowed','Not enough quantity remains','Confirm each delivery before completing the need','Choose a valid delivered quantity for your claim','Confirmed quantity must be within the commitment','Requested quantity cannot be below existing commitments','Configure the organization EIN before emailing donation receipts','Receipts cannot exceed confirmed contributions','Choose a completed calendar year'];
  if(safe.includes(error.message)) throw new HttpError(409,error.message);
  if(error.code==='23505') throw new HttpError(409,'This record already exists. Please refresh and try again.');
  throw new HttpError(500,'We couldn’t save or load this information. Please try again.');
 }
 return data;
}
export async function one<T = any>(query: PromiseLike<{data:any;error:{message:string;code?:string}|null}>):Promise<NonNullable<T>> { const data=await result<T>(query);if(data==null)throw new HttpError(404,'Record not found.');return data; }
export async function identity(req:Request,db:DB,org:string) {
 let userId:string|null=null; let staff=false; let volunteerId:string|null=null;
 const auth=req.headers.authorization;
 if(auth?.startsWith('Bearer ')) { userId=await verifyStaffToken(auth.slice(7));const member=await result(db.from('organization_members').select('role').eq('organization_id',org).eq('user_id',userId).maybeSingle());staff=!!member; }
 if(!auth && process.env.NODE_ENV!=='production' && process.env.BRIDGE_EMAIL_TRANSPORT==='capture') {
  const member=await result(db.from('organization_members').select('user_id,role').eq('organization_id',org).eq('role','admin').limit(1).maybeSingle());
  if(member){userId=member.user_id;staff=true;}
 }
 const token=readSession(req.headers.cookie);
 if(token){const session=await result(db.from('volunteer_sessions').select('volunteer_id').eq('organization_id',org).eq('token_hash',hashToken(token)).gt('expires_at',new Date().toISOString()).maybeSingle());volunteerId=session?.volunteer_id||null;}
 return {userId,staff,volunteerId};
}
export async function limit(db:DB,key:string,max:number,seconds:number) { const allowed=await result(db.rpc('take_rate_limit',{p_key:hashToken(key),p_limit:max,p_seconds:seconds}));if(!allowed)throw new HttpError(429,'Too many requests. Please wait before trying again.'); }
export const safeNeedFields='id,title,category,description,urgency,service_area,ways_to_help,capability_tags,needed_by,window_start,window_end,status,approved_at,created_at,quantity_required,quantity_committed,quantity_received,unit_label,public_location,poster_name,photo_path,photo_alt,photo_approved_at';
