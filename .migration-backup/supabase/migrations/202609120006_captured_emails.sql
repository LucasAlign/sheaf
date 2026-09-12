create table public.captured_emails (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 idempotency_key text not null,
 to_email text not null,
 from_email text not null,
 subject text not null,
 html text not null,
 attachments jsonb not null default '[]'::jsonb,
 captured_at timestamptz not null default now(),
 unique(organization_id,idempotency_key)
);

revoke all on public.captured_emails from public, anon, authenticated;
grant all on public.captured_emails to service_role;