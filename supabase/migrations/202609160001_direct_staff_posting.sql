-- Approved organization staff publish needs directly. There is no second
-- approval queue; the posting user's identity remains recorded for auditing.

alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('admin', 'caseworker', 'county_coordinator', 'assistant'));

update public.needs
set status = 'open',
    approved_at = coalesce(approved_at, created_at, now()),
    approved_by = coalesce(approved_by, created_by),
    next_wave_at = coalesce(next_wave_at, now())
where status = 'pending';

alter table public.needs alter column status set default 'open';
alter table public.needs drop constraint if exists needs_status_check;
alter table public.needs
  add constraint needs_status_check
  check (status in ('open', 'claimed', 'completed'));
alter table public.needs
  add constraint needs_published_at_check check (approved_at is not null);

drop function if exists public.transition_need(uuid, uuid, uuid, text);
