create function public.prepare_reminders(p_org uuid) returns int language plpgsql security definer set search_path='' as $$
declare n record; queued int:=0;
begin
 for n in select needs.id from public.needs needs join public.claims c on c.need_id=needs.id
 where needs.organization_id=p_org and needs.status='claimed' and c.created_at<now()-interval '48 hours'
 order by c.created_at limit 30 for update of needs skip locked loop
  if public.queue_reminder(p_org,n.id) then queued:=queued+1; end if;
 end loop;
 return queued;
end; $$;
revoke execute on function public.prepare_reminders(uuid) from public,anon,authenticated;
grant execute on function public.prepare_reminders(uuid) to service_role;
