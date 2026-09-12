import portal from '../src/bridge/api/portal';
import cron from '../src/bridge/api/cron';
import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Request,Response } from './http';
export async function handleApiRequest(incoming:IncomingMessage,outgoing:ServerResponse) {
 const req=incoming as Request,res=outgoing as Response;
 res.status=function(code){this.statusCode=code;return this;};
 res.json=function(body){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(body));};
 const url=new URL(req.url||'/','http://localhost');req.query=Object.fromEntries(url.searchParams);
 if(req.method==='POST'){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16000){res.status(413).json({error:'Request is too large'});return;}chunks.push(chunk);}try{req.body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.status(400).json({error:'Invalid JSON'});return;}}
  if(url.pathname==='/api/healthz' && req.method==='GET')
    return res.status(200).json({status:'ok'});
  if(url.pathname==='/api/portal')return portal(req,res);
 if(url.pathname==='/api/cron')return cron(req,res);
 return res.status(404).json({error:'Not found'});
}
