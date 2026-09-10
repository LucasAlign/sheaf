import { defineConfig,loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleApiRequest } from './server/adapter';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SHEAF_ORG_ID','APP_URL','RESEND_API_KEY','EMAIL_FROM','CRON_SECRET','LINK_SIGNING_SECRET'])if(!process.env[key]&&env[key])process.env[key]=env[key];
 return {server:{allowedHosts:process.env.REPLIT_DEV_DOMAIN?[process.env.REPLIT_DEV_DOMAIN]:[]},plugins:[react(),tailwindcss(),{name:'sheaf-development-api',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/api/'))return next();void handleApiRequest(req,res).catch(()=>{res.statusCode=500;res.end('Unexpected API error');});});}}]};
});
