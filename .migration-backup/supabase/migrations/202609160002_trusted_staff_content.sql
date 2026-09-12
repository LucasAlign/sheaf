-- Content from authorized staff is published immediately. Keep the legacy
-- photo_approved_at column populated for backward compatibility, but never use
-- it as a manual review gate.

update public.needs
set photo_approved_at = coalesce(photo_approved_at, created_at, now())
where photo_path is not null;

create or replace function public.publish_staff_photo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.photo_path is distinct from old.photo_path then
    new.photo_approved_at := case when new.photo_path is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists publish_staff_photo on public.needs;
create trigger publish_staff_photo
before update of photo_path on public.needs
for each row execute function public.publish_staff_photo();
