import { z } from 'zod';
import { config,database,identity,result,one,limit,safeNeedFields } from '../server/db';
import { HttpError,type Request,type Response } from '../server/http';
import { checkOrigin,newToken,hashToken,sessionCookie,escapeHtml } from '../server/security';
import { claimSchema,magicSchema,needSchema,profileSchema,receiptSchema,contributionSchema,uuid } from '../server/validation';
import { emailTemplate,sendEmail } from '../server/email';
import { buildReceipt } from '../server/receipt';

export default async function handler(req:Request,res:Response) {
 res.setHeader('Cache-Control','no-store');
 try {
  const c=config();const db=database();const action=String(req.query.action||'');
  if(req.method!=='GET'&&req.method!=='POST')throw new HttpError(405,'Method not allowed');
  if(req.method==='POST'){checkOrigin(req.headers.origin,c.appUrl);if(!req.headers['content-type']?.includes('application/json'))throw new HttpError(415,'JSON is required');if(JSON.stringify(req.body).length>16000)throw new HttpError(413,'This request is too large');}
  if(['feed','outreach'].includes(action)!==(req.method==='GET'))throw new HttpError(405,'Method not allowed');
  const me=await identity(req,db,c.org);
  const staff=()=>{if(!me.staff||!me.userId)throw new HttpError(403,'Caseworker access is required.');return me.userId;};
  const volunteer=()=>{if(!me.volunteerId)throw new HttpError(401,'Please confirm your email to continue.');return me.volunteerId;};
  if(action==='feed') {
   const org=await one(db.from('organizations').select('id,name,service_area').eq('id',c.org).single());
   const claims=me.volunteerId?await result(db.from('claims').select('need_id').eq('organization_id',c.org).eq('volunteer_id',me.volunteerId)):[];
   const mine=(claims||[]).map(x=>x.need_id);
   let q=db.from('needs').select(safeNeedFields).eq('organization_id',c.org).order('created_at',{ascending:false});
   if(!me.staff)q=q.or(`and(status.eq.open,approved_at.not.is.null,needed_by.gt.${new Date().toISOString()})${mine.length?`,id.in.(${mine.join(',')})`:''}`);
   const needs=await result(q.limit(1000));
   const profile=me.volunteerId?await result(db.rpc('get_volunteer_profile',{p_org:c.org,p_volunteer:me.volunteerId})):null;
   const scores=me.volunteerId?await result(db.rpc('score_matches',{p_org:c.org,p_volunteer:me.volunteerId})):[];
   const mapped=new Map((scores||[]).map((s:{need_id:string})=>[s.need_id,s]));
   return res.status(200).json({org,profile,admin:me.staff,needs:(needs||[]).map(n=>{const s=mapped.get(n.id) as {score:number;reasons:string[];distance:number|null}|undefined;return {...n,...(s?{score:Number(s.score),reasons:s.reasons,...(s.distance===null?{}:{distance:Number(s.distance)})}:{}),claimed_by_me:mine.includes(n.id)};})});
  }
  if(action==='outreach'){
   staff();
   const queries=await Promise.all([
    db.from('notifications').select('id',{count:'exact',head:true}).eq('organization_id',c.org).eq('status','sent').gte('sent_at',new Date(Date.now()-7*86400000).toISOString()),
    db.from('notifications').select('id',{count:'exact',head:true}).eq('organization_id',c.org).in('status',['queued','sending']),
    db.from('notifications').select('id',{count:'exact',head:true}).eq('organization_id',c.org).eq('status','failed'),
    db.from('volunteers').select('id',{count:'exact',head:true}).eq('organization_id',c.org)
   ]);
   for(const q of queries)if(q.error)throw new HttpError(500,'Could not load outreach activity.');
   const recent=await result(db.from('notifications').select('id,kind,status,created_at,send_after').eq('organization_id',c.org).order('created_at',{ascending:false}).limit(20));
   return res.status(200).json({sent:queries[0].count,queued:queries[1].count,failed:queries[2].count,volunteers:queries[3].count,recent});
  }
  if(action==='need-matches'){
   staff();const p=receiptSchema.parse(req.body);
   const scores=await result(db.rpc('score_matches',{p_org:c.org}));
   const top=(scores||[]).filter((s:{need_id:string})=>s.need_id===p.need_id).sort((a:{score:number},b:{score:number})=>Number(b.score)-Number(a.score)).slice(0,10);
   const ids=top.map((s:{volunteer_id:string})=>s.volunteer_id);
   const contacts=ids.length?await result(db.from('volunteers').select('id,name,frequency').eq('organization_id',c.org).in('id',ids)):[];
   return res.status(200).json({matches:top.map((s:{volunteer_id:string})=>({...s,...contacts?.find(v=>v.id===s.volunteer_id)}))});
  }
  if(action==='magic-link') {
   const p=magicSchema.parse(req.body);
   await limit(db,`${c.org}:email:${p.email}`,3,3600);
   await limit(db,`${c.org}:ip:${req.headers['x-real-ip']||req.socket.remoteAddress||'unknown'}`,10,3600);
   if(p.need_id){const n=await result(db.from('needs').select('ways_to_help,status,approved_at,needed_by').eq('organization_id',c.org).eq('id',p.need_id).maybeSingle());if(!n||n.status!=='open'||!n.approved_at||Date.parse(n.needed_by)<Date.now()||!n.ways_to_help.includes(p.way))throw new HttpError(409,'This need is no longer available.');}
   const org=await one(db.from('organizations').select('name').eq('id',c.org).single());const token=newToken();const hash=hashToken(token);
   await result(db.from('magic_links').insert({token_hash:hash,organization_id:c.org,email:p.email,name:p.name,need_id:p.need_id||null,way:p.way||null,expires_at:new Date(Date.now()+20*60000).toISOString()}));
   const link=`${c.appUrl}/#token=${token}${p.need_id?`&need=${p.need_id}`:''}`;
   try{await sendEmail(p.email,'Your secure Sheaf link',emailTemplate(org.name,p.need_id?'Your next kind thing.':'Welcome to your community of care.','<p>Use this secure link within 20 minutes. Your email is confirmed only when you press the confirmation button. If you didn’t request this, you can ignore it.</p>',link,p.need_id?'Review & confirm my help':'Open my profile'),`magic:${hash}`);}catch(e){await result(db.from('magic_links').delete().eq('token_hash',hash).eq('organization_id',c.org));throw e;}
   return res.status(200).json({ok:true});
  }
  if(action==='redeem') {
   const {token}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body);
   await limit(db,`${c.org}:redeem:${req.headers['x-real-ip']||req.socket.remoteAddress}`,20,600);
   const session=newToken();await result(db.rpc('redeem_magic_link',{p_org:c.org,p_hash:hashToken(token),p_session_hash:hashToken(session)}));
   res.setHeader('Set-Cookie',sessionCookie(session,new URL(c.appUrl).protocol==='https:'));return res.status(200).json({ok:true});
  }
  if(action==='claim'){const vid=volunteer();const p=claimSchema.parse(req.body);await limit(db,`${vid}:claim`,10,3600);await result(db.rpc('claim_need',{p_org:c.org,p_need:p.need_id,p_volunteer:vid,p_way:p.way}));return res.status(200).json({ok:true});}
  if(action==='profile'){const vid=volunteer();const p=profileSchema.parse(req.body);await result(db.rpc('save_volunteer_profile',{p_org:c.org,p_volunteer:vid,p_profile:p}));return res.status(200).json({ok:true});}
  if(action==='post'){const user=staff();const {latitude,longitude,...p}=needSchema.parse(req.body);await result(db.from('needs').insert({...p,organization_id:c.org,created_by:user,status:'pending',geolocation:latitude!==undefined?`SRID=4326;POINT(${longitude} ${latitude})`:null}));return res.status(201).json({ok:true});}
  if(action==='transition'){const user=staff();const p=z.object({need_id:uuid,status:z.enum(['open','completed'])}).strict().parse(req.body);await result(db.rpc('transition_need',{p_org:c.org,p_need:p.need_id,p_user:user,p_status:p.status}));return res.status(200).json({ok:true});}
  if(action==='remind'){staff();const p=receiptSchema.parse(req.body);const queued=await result(db.rpc('queue_reminder',{p_org:c.org,p_need:p.need_id}));if(!queued)throw new HttpError(409,'A reminder was already sent today, the frequency cap was reached, or this need is no longer claimed.');return res.status(200).json({ok:true});}
  if(action==='contribution') {
   const user=staff();const p=contributionSchema.parse(req.body);const n=await one(db.from('needs').select('status').eq('organization_id',c.org).eq('id',p.need_id).single());if(n.status!=='completed')throw new HttpError(409,'Complete the need before recording a received contribution.');
   const claim=await one(db.from('claims').select('id').eq('organization_id',c.org).eq('need_id',p.need_id).single());
   await result(db.from('contributions').insert({organization_id:c.org,claim_id:claim.id,kind:p.kind,amount_cents:p.kind==='funds'?p.amount_cents:null,description:p.description,received_at:p.received_at,recorded_by:user}));return res.status(201).json({ok:true});
  }
  if(action==='receipt') {
   const p=receiptSchema.parse(req.body);if(!me.staff)volunteer();const claim=await result(db.from('claims').select('id,volunteer_id').eq('organization_id',c.org).eq('need_id',p.need_id).maybeSingle());if(!claim||!me.staff&&claim.volunteer_id!==me.volunteerId)throw new HttpError(404,'Receipt not found.');
   const contribution=await result(db.from('contributions').select('*').eq('organization_id',c.org).eq('claim_id',claim.id).maybeSingle());if(!contribution)throw new HttpError(404,'The caseworker has not recorded a received contribution yet.');
   const org=await one(db.from('organizations').select('name,ein,contact_email').eq('id',c.org).single());if(!org.ein)throw new HttpError(409,'The organization needs to add its EIN before issuing receipts.');
   const v=await one(db.from('volunteers').select('name').eq('organization_id',c.org).eq('id',claim.volunteer_id).single());const need=await one(db.from('needs').select('title').eq('organization_id',c.org).eq('id',p.need_id).single());
   return res.status(200).json({text:buildReceipt({org,volunteer:v,need,contribution})});
  }
  if(action==='claim-contact'){staff();const p=receiptSchema.parse(req.body);const claim=await one(db.from('claims').select('volunteer_id,way,created_at').eq('organization_id',c.org).eq('need_id',p.need_id).single());const contact=await one(db.from('volunteers').select('name,email').eq('organization_id',c.org).eq('id',claim.volunteer_id).single());return res.status(200).json({...contact,way:claim.way});}
  throw new HttpError(404,'Not found');
 } catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:e.issues[0]?.message||'Please check your form.'});return res.status(e instanceof HttpError?e.status:500).json({error:e instanceof HttpError?e.message:'Something went wrong. Please try again.'});}
}
