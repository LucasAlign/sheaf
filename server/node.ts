// Portable server for Replit and other Node hosts. Vercel uses api/*.ts directly.
import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import portal from '../api/portal';
import cron from '../api/cron';
import type { Request,Response } from './http';
const root=resolve('dist');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.ico':'image/x-icon'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
createServer(async(incoming,outgoing)=>{
 const req=incoming as Request;const res=outgoing as Response;
 res.status=function(code){this.statusCode=code;return this;};
 res.json=function(body){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(body));};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',csp);res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
 try{
  const url=new URL(req.url||'/','http://localhost');req.query=Object.fromEntries(url.searchParams);
  if(url.pathname.startsWith('/api/')){
   if(req.method==='POST'){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16000){res.status(413).json({error:'Request is too large'});return;}chunks.push(chunk);}try{req.body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.status(400).json({error:'Invalid JSON'});return;}}
   if(url.pathname==='/api/portal')return await portal(req,res);
   if(url.pathname==='/api/cron')return await cron(req,res);
   return res.status(404).json({error:'Not found'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).json({error:'Method not allowed'});
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root+sep))return res.status(404).json({error:'Not found'});
  const info=await stat(path);if(!info.isFile())return res.status(404).json({error:'Not found'});
  res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control',path.includes(`${sep}assets${sep}`)?'public, max-age=31536000, immutable':'no-cache');
  res.end(req.method==='HEAD'?undefined:await readFile(path));
 }catch{if(!res.headersSent)res.status(404).json({error:'Not found'});else res.end();}
}).listen(Number(process.env.PORT||5173),'0.0.0.0',()=>console.log(`Bridge is running on port ${process.env.PORT||5173}`));
// Reserved VM only; autoscale hosts should use the standalone scheduled script.
if(process.env.SHEAF_RUN_SCHEDULER==='true'){
 if(!process.env.CRON_SECRET)throw new Error('CRON_SECRET is required for the scheduler.');
 let running=false;
 setInterval(async()=>{if(running)return;running=true;try{const r=await fetch(`http://127.0.0.1:${process.env.PORT||5173}/api/cron`,{headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(240000)});if(!r.ok)console.error(`Notification scheduler returned ${r.status}`);}catch{console.error('Notification scheduler could not complete.');}finally{running=false;}},5*60000).unref();
}
