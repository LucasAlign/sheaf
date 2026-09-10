create table public.need_photo_uploads (
 path text primary key,organization_id uuid not null references public.organizations(id),uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.need_photo_uploads enable row level security;
revoke all on public.need_photo_uploads from anon,authenticated;
grant all on public.need_photo_uploads to service_role;
-- Storage is present on Supabase; plain PostGIS integration databases omit it.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('need-photos','need-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 end if;
end; $$;
