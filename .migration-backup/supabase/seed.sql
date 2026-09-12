-- Run once; no fictitious needs or volunteer data is inserted into production.
insert into public.organizations(id,name,service_area,contact_email)
values('c3206037-3638-4263-b18d-813a5895f1c8','Keystone Family Alliance','Pennsylvania','REPLACE_WITH_VERIFIED_CASEWORKER_EMAIL')
on conflict(id) do nothing;
-- After inviting your first staff member in Supabase Auth, add their real user UUID:
-- insert into public.organization_members(organization_id,user_id,role)
-- values('c3206037-3638-4263-b18d-813a5895f1c8','YOUR_AUTH_USER_UUID','caseworker');
-- Roles: admin, caseworker, county_coordinator, assistant.
