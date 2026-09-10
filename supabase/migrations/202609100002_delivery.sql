create function public.get_volunteer_profile(p_org uuid,p_volunteer uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',name,'email',email,'location',location,'capability_tags',capability_tags,'availability',availability,'frequency',frequency,'daily_cap',daily_cap,
 'latitude',extensions.st_y(geolocation::extensions.geometry),'longitude',extensions.st_x(geolocation::extensions.geometry)) from public.volunteers where id=p_volunteer and organization_id=p_org;
$$;
-- Reservation plus send-time cap check prevents a digest and live waves from
-- exceeding the same rolling-day cap. Confirmation mail is transactional.
create function public.delivery_allowed(p_org uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications; cap int; preceding int;
begin
 select * into n from public.notifications where id=p_id and organization_id=p_org;
 if not found or n.status<>'sending' then return false; end if;
 if n.kind='claim_confirmation' then return true; end if;
 select daily_cap into cap from public.volunteers where id=n.volunteer_id for update;
 select count(*) into preceding from public.notifications where volunteer_id=n.volunteer_id and id<>n.id and kind in ('match','digest','reminder')
 and ((status='sent' and sent_at>now()-interval '24 hours') or (status='sending' and (created_at,id)<(n.created_at,n.id)));
 return preceding<cap;
end; $$;
revoke execute on function public.get_volunteer_profile(uuid,uuid),public.delivery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_volunteer_profile(uuid,uuid),public.delivery_allowed(uuid,uuid) to service_role;
