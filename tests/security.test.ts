import { describe,it,expect } from 'vitest';
import { newToken,hashToken,readSession,sessionCookie,checkOrigin,constantEqual,escapeHtml,emailClaimToken } from '../server/security';
import { needSchema,profileSchema,magicSchema,contributionSchema } from '../server/validation';
import { emptyProfile } from '../src/types';
import { demoNeeds } from '../src/demo';
import { rankDemo } from '../src/matching';
import { buildReceipt } from '../server/receipt';
describe('guest identity boundary',()=>{
 it('uses independent 256-bit opaque tokens and stores only hashes',()=>{const a=newToken(),b=newToken();expect(a).toHaveLength(43);expect(a).not.toBe(b);expect(hashToken(a)).toHaveLength(64);expect(hashToken(a)).not.toContain(a);});
 it('parses only a correctly sized session token',()=>{const token=newToken();expect(readSession(`x=y; sheaf_session=${token}; z=1`)).toBe(token);expect(readSession('sheaf_session=attacker')).toBeNull();});
 it('uses HttpOnly, SameSite cookies and secure transport in production',()=>{expect(sessionCookie('test',true)).toContain('HttpOnly; SameSite=Lax');expect(sessionCookie('test',true)).toContain('; Secure');});
 it('rejects missing and cross-site origins',()=>{expect(()=>checkOrigin(undefined,'https://sheaf.example')).toThrow();expect(()=>checkOrigin('https://evil.example','https://sheaf.example')).toThrow();expect(()=>checkOrigin('https://sheaf.example','https://sheaf.example/')).not.toThrow();});
 it('checks cron secrets without accepting prefixes',()=>{expect(constantEqual('Bearer abc','Bearer ab')).toBe(false);expect(constantEqual('Bearer abc','Bearer abc')).toBe(true);});
 it('email claims are stable for retries and bound to one notification and need',()=>{const key='x'.repeat(32);expect(emailClaimToken(key,'email-1','need-1')).toBe(emailClaimToken(key,'email-1','need-1'));expect(emailClaimToken(key,'email-1','need-1')).not.toBe(emailClaimToken(key,'email-1','need-2'));expect(()=>emailClaimToken('short','email-1','need-1')).toThrow();});
 it('escapes volunteer and need content before HTML emails',()=>expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
});
describe('input validation',()=>{
 const {id,status,created_at,approved_at,distance,...need}=demoNeeds[0];
 it('rejects attempts to set approval and organization in a public form',()=>{expect(needSchema.safeParse({...need,status:'open'}).success).toBe(false);expect(profileSchema.safeParse({...emptyProfile,name:'Jo',email:'jo@example.org',organization_id:'other'}).success).toBe(false);});
 it('requires valid nonempty help options and future deadlines',()=>{expect(needSchema.safeParse({...need,ways_to_help:[' ']}).success).toBe(false);expect(needSchema.safeParse({...need,needed_by:'2000-01-01T00:00:00Z'}).success).toBe(false);});
 it('requires paired coordinates and ordered availability',()=>{const p={...emptyProfile,name:'Jo',email:'jo@example.org'};expect(profileSchema.safeParse({...p,latitude:40}).success).toBe(false);expect(profileSchema.safeParse({...p,availability:[{start:'2030-01-02T00:00:00Z',end:'2030-01-01T00:00:00Z'}]}).success).toBe(false);});
 it('requires a help option with a magic claim link',()=>expect(magicSchema.safeParse({email:'jo@example.org',name:'Jo',need_id:'6dce2651-9c26-49cc-8fcf-665eb70f1bf0'}).success).toBe(false));
 it('rejects arbitrary capability tags and unsafe receipt amounts',()=>{expect(profileSchema.safeParse({...emptyProfile,name:'Jo',email:'jo@example.org',capability_tags:['admin']}).success).toBe(false);expect(contributionSchema.safeParse({need_id:'6dce2651-9c26-49cc-8fcf-665eb70f1bf0',kind:'funds',amount_cents:0,description:'Pledge',received_at:new Date().toISOString()}).success).toBe(false);});
});
describe('matching and acknowledgments',()=>{
 it('a capability match can outrank a closer unrelated need',()=>{const ranked=rankDemo(demoNeeds,{...emptyProfile,capability_tags:['meals']});expect(ranked[0].category).toBe('meals');expect(ranked[0].reasons).toContain('Fits how you like to help');});
 it('does not invent an availability reason for an unconfigured window',()=>expect(rankDemo(demoNeeds,emptyProfile)[0].reasons).not.toContain('Fits your availability'));
 const input={org:{name:'Example',ein:'00-0000000',contact_email:'care@example.org'},volunteer:{name:'Jo'},need:{title:'Bedding'},contribution:{id:'receipt-1',kind:'goods',amount_cents:null,description:'Twin bedding',received_at:'2026-09-01T12:00:00Z'}};
 it('does not invent a dollar value for goods or volunteer time',()=>{const text=buildReceipt(input);expect(text).toContain('No monetary value');expect(text).not.toContain('$');});
 it('requires a real configured EIN',()=>expect(()=>buildReceipt({...input,org:{...input.org,ein:null}})).toThrow('EIN'));
 it('acknowledges only a recorded funds amount',()=>expect(buildReceipt({...input,contribution:{...input.contribution,kind:'funds',amount_cents:25000}})).toContain('$250.00'));
});
