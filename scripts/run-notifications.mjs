const {APP_URL,CRON_SECRET}=process.env;
if(!APP_URL||!CRON_SECRET)throw new Error('APP_URL and CRON_SECRET must be configured.');
const response=await fetch(`${APP_URL.replace(/\/$/,'')}/api/cron`,{headers:{Authorization:`Bearer ${CRON_SECRET}`},signal:AbortSignal.timeout(240000)});
if(!response.ok)throw new Error(`Notification scheduler failed (${response.status}).`);
console.log(await response.json());
