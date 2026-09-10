import { escapeHtml } from './security';
import { HttpError } from './http';
export function emailTemplate(org:string,title:string,body:string,link:string,button:string) {
 return `<!doctype html><html><body style="margin:0;background:#FAF8F4;font-family:Arial,sans-serif;color:#1B211F"><main style="max-width:540px;margin:30px auto;padding:32px;background:white;border-radius:12px"><p style="color:#0E5A52;font-family:Georgia,serif;font-size:30px;margin:0">sheaf.</p><p style="font-size:13px;color:#667168">${escapeHtml(org)}</p><h1 style="font:28px Georgia,serif">${escapeHtml(title)}</h1><div style="line-height:1.7">${body}</div><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0E5A52;color:white;padding:13px 20px;border-radius:5px;text-decoration:none">${escapeHtml(button)}</a></p><p style="font-size:12px;color:#667168">Little by little. Together.<br>Manage your email preferences in your Sheaf profile.</p></main></body></html>`;
}
export async function sendEmail(to:string,subject:string,html:string,key:string,attachments:{filename:string;content:string}[] = []) {
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new HttpError(503,'Email is not connected yet. Please contact the organization.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html,...(attachments.length?{attachments}:{})}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new HttpError(502,'The email could not be delivered. Please try again shortly.');
}
