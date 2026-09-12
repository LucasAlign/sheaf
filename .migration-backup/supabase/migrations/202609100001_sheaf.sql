-- Sheaf: a single-organization portal, with organization-scoped relationships.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, service_area text not null,
 contact_email text not null, ein text, created_at timestamptz not null default now()
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
 role text not null check (role in ('admin','caseworker')), primary key(organization_id,user_id)
);
create table public.volunteers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, email text not null, location text not null default '',
 capability_tags text[] not null default '{}', availability jsonb not null default '[]',
 geolocation extensions.geography(point,4326), frequency text not null default 'off' check (frequency in ('instant','digest','off')),
 daily_cap int not null default 2 check(daily_cap between 1 and 3), verified_at timestamptz not null default now(),
 created_at timestamptz not null default now(), unique(organization_id,email), unique(organization_id,id),
 check (email=lower(email)), check (jsonb_typeof(availability)='array')
);
create index volunteers_geo on public.volunteers using gist(geolocation);
create table public.households (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 internal_reference text not null, notes text, unique(organization_id,id)
);
create table public.needs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 household_id uuid, title text not null check(length(title) between 1 and 120),
 category text not null check(category in ('goods','transportation','meals','helping hands','funds')),
 description text not null check(length(description) between 1 and 2000),
 urgency text not null check(urgency in ('critical','soon','flexible')), service_area text not null,
 ways_to_help text[] not null check(cardinality(ways_to_help) between 1 and 8), capability_tags text[] not null,
 geolocation extensions.geography(point,4326), needed_by timestamptz not null,
 window_start timestamptz, window_end timestamptz,
 status text not null default 'pending' check(status in ('pending','open','claimed','completed')),
 created_by uuid references auth.users(id), approved_by uuid references auth.users(id),
 approved_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
 wave int not null default 0, next_wave_at timestamptz, unique(organization_id,id),
 foreign key(organization_id,household_id) references public.households(organization_id,id),
 check ((window_start is null and window_end is null) or (window_start is not null and window_end is not null and window_end>window_start)),
 check (status='pending' or approved_at is not null)
);
create index needs_geo on public.needs using gist(geolocation);
create index needs_live on public.needs(organization_id,status,created_at desc);
create table public.claims (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 need_id uuid not null unique, volunteer_id uuid not null, way text not null,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(organization_id,id),
 foreign key(organization_id,need_id) references public.needs(organization_id,id),
 foreign key(organization_id,volunteer_id) references public.volunteers(organization_id,id)
);
create table public.matches (
 organization_id uuid not null references public.organizations(id), need_id uuid not null, volunteer_id uuid not null,
 score numeric not null, reasons text[] not null, distance numeric, calculated_at timestamptz not null default now(),
 notified_at timestamptz, primary key(need_id,volunteer_id),
 foreign key(organization_id,need_id) references public.needs(organization_id,id),
 foreign key(organization_id,volunteer_id) references public.volunteers(organization_id,id)
);
create table public.volunteer_sessions (
 token_hash text primary key, organization_id uuid not null, volunteer_id uuid not null,
 expires_at timestamptz not null, foreign key(organization_id,volunteer_id) references public.volunteers(organization_id,id)
);
create table public.magic_links (
 token_hash text primary key, organization_id uuid not null references public.organizations(id),
 email text not null, name text not null, need_id uuid, way text,
 expires_at timestamptz not null, consumed_at timestamptz,
 foreign key(organization_id,need_id) references public.needs(organization_id,id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 volunteer_id uuid not null, need_id uuid,
 kind text not null check(kind in ('match','digest','reminder','claim_confirmation')),
 payload jsonb not null default '{}', dedupe_key text not null unique,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','cancelled')),
 send_after timestamptz not null default now(), created_at timestamptz not null default now(), sent_at timestamptz,
 lease_until timestamptz, attempts int not null default 0, last_error text,
 foreign key(organization_id,volunteer_id) references public.volunteers(organization_id,id),
 foreign key(organization_id,need_id) references public.needs(organization_id,id)
);
create index notification_queue on public.notifications(status,send_after);
create index notification_cap on public.notifications(volunteer_id,created_at);
create table public.contributions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, claim_id uuid not null unique,
 kind text not null check(kind in ('goods','funds')), amount_cents bigint,
 description text not null, received_at timestamptz not null, recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), foreign key(organization_id,claim_id) references public.claims(organization_id,id),
 check ((kind='funds' and amount_cents>0) or (kind='goods' and amount_cents is null))
);
create table public.rate_limits (key text primary key, count int not null, window_start timestamptz not null);

create function public.is_staff(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid());
$$;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.volunteers enable row level security;
alter table public.households enable row level security;
alter table public.needs enable row level security;
alter table public.claims enable row level security;
alter table public.matches enable row level security;
alter table public.volunteer_sessions enable row level security;
alter table public.magic_links enable row level security;
alter table public.notifications enable row level security;
alter table public.contributions enable row level security;
alter table public.rate_limits enable row level security;
-- No anonymous writes. Private records are accessed only by the scoped server API.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations to anon,authenticated;
grant select on public.organization_members to authenticated;
grant select(id,organization_id,title,category,description,urgency,service_area,ways_to_help,capability_tags,needed_by,window_start,window_end,status,approved_at,created_at) on public.needs to anon,authenticated;
grant select on public.volunteers,public.households,public.claims,public.matches,public.notifications,public.contributions to authenticated;
create policy org_read on public.organizations for select using(true);
create policy membership_self on public.organization_members for select to authenticated using(user_id=auth.uid());
create policy verified_feed on public.needs for select using(status='open' and approved_at is not null);
create policy staff_needs on public.needs for select to authenticated using(public.is_staff(organization_id));
create policy staff_volunteers on public.volunteers for select to authenticated using(public.is_staff(organization_id));
create policy staff_households on public.households for select to authenticated using(public.is_staff(organization_id));
create policy staff_claims on public.claims for select to authenticated using(public.is_staff(organization_id));
create policy staff_matches on public.matches for select to authenticated using(public.is_staff(organization_id));
create policy staff_notifications on public.notifications for select to authenticated using(public.is_staff(organization_id));
create policy staff_contributions on public.contributions for select to authenticated using(public.is_staff(organization_id));

create function public.take_rate_limit(p_key text, p_limit int, p_seconds int) returns boolean language plpgsql security definer set search_path='' as $$
declare used int;
begin
 insert into public.rate_limits as r values(p_key,1,now()) on conflict(key) do update set
 count=case when r.window_start<now()-make_interval(secs=>p_seconds) then 1 else r.count+1 end,
 window_start=case when r.window_start<now()-make_interval(secs=>p_seconds) then now() else r.window_start end returning count into used;
 return used<=p_limit;
end; $$;

create function public.claim_need(p_org uuid,p_need uuid,p_volunteer uuid,p_way text) returns uuid language plpgsql security definer set search_path='' as $$
declare n public.needs; c public.claims; cid uuid;
begin
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if not found then raise exception 'Need not found'; end if;
 select * into c from public.claims where need_id=p_need;
 if found and c.volunteer_id=p_volunteer then return c.id; end if;
 if n.status<>'open' or n.approved_at is null or n.needed_by<now() then raise exception 'This need is no longer available'; end if;
 if not p_way=any(n.ways_to_help) then raise exception 'Choose a listed way to help'; end if;
 insert into public.claims(organization_id,need_id,volunteer_id,way) values(p_org,p_need,p_volunteer,p_way) returning id into cid;
 update public.needs set status='claimed',next_wave_at=null where id=p_need;
 update public.notifications set status='cancelled' where need_id=p_need and kind='match' and status='queued';
 insert into public.notifications(organization_id,volunteer_id,need_id,kind,dedupe_key) values(p_org,p_volunteer,p_need,'claim_confirmation','claim:'||cid);
 return cid;
end; $$;

create function public.redeem_magic_link(p_org uuid,p_hash text,p_session_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.magic_links; vid uuid;
begin
 select * into l from public.magic_links where token_hash=p_hash and organization_id=p_org for update;
 if not found or l.expires_at<now() or l.consumed_at is not null then raise exception 'This link has expired or has already been used'; end if;
 insert into public.volunteers(organization_id,name,email) values(p_org,l.name,l.email) on conflict(organization_id,email) do update set verified_at=now() returning id into vid;
 if l.need_id is not null then perform public.claim_need(p_org,l.need_id,vid,l.way); end if;
 update public.magic_links set consumed_at=now() where token_hash=p_hash;
 insert into public.volunteer_sessions values(p_session_hash,p_org,vid,now()+interval '30 days');
 return vid;
end; $$;

create function public.save_volunteer_profile(p_org uuid,p_volunteer uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.volunteers set name=p_profile->>'name',location=p_profile->>'location',
 capability_tags=array(select jsonb_array_elements_text(p_profile->'capability_tags')), availability=p_profile->'availability',
 frequency=p_profile->>'frequency',daily_cap=(p_profile->>'daily_cap')::int,
 geolocation=case when p_profile->>'latitude' is null then null else extensions.st_setsrid(extensions.st_makepoint((p_profile->>'longitude')::float8,(p_profile->>'latitude')::float8),4326)::extensions.geography end
 where id=p_volunteer and organization_id=p_org;
 if not found then raise exception 'Volunteer not found'; end if;
 if p_profile->>'frequency'='off' then update public.notifications set status='cancelled' where volunteer_id=p_volunteer and kind in ('match','digest') and status='queued'; end if;
end; $$;

create function public.score_matches(p_org uuid,p_volunteer uuid default null) returns table(need_id uuid,volunteer_id uuid,score numeric,reasons text[],distance numeric) language sql stable security definer set search_path='' as $$
 with pairs as (
 select n.*,v.id vid,v.capability_tags tags,v.availability windows,
 case when n.geolocation is not null and v.geolocation is not null then extensions.st_distance(n.geolocation,v.geolocation)/1609.344 end miles,
 (select count(*) from public.claims c join public.needs hn on hn.id=c.need_id where c.volunteer_id=v.id and c.completed_at is not null and hn.category=n.category) history,
 (select count(*) from public.notifications nt where nt.volunteer_id=v.id and nt.kind in ('match','digest') and nt.created_at>now()-interval '7 days' and nt.status in ('queued','sending','sent')) recent
 from public.needs n join public.volunteers v on v.organization_id=n.organization_id
 where n.organization_id=p_org and n.status='open' and n.approved_at is not null and n.needed_by>now() and (p_volunteer is null or v.id=p_volunteer)
 ), evaluated as (
 select *,tags&&capability_tags fit,
 exists(select 1 from jsonb_array_elements(windows) w where (w->>'start')::timestamptz<=window_start and (w->>'end')::timestamptz>=window_end) time_fit
 from pairs
 ) select id,vid,
 (case when miles is null then 0 else greatest(0,30*(1-miles/60)) end + case when fit then 35 else 0 end + case when time_fit then 20 else 0 end + least(history,2)*5 + greatest(0,5-extract(epoch from now()-created_at)/86400) - least(recent,5)*3)::numeric,
 array_remove(array[case when fit then 'Fits how you like to help' end,case when miles is not null then round(miles::numeric,1)||' miles away' end,case when time_fit then 'Fits your availability' end,case when history>0 then 'Builds on your past help' end],null),
 round(miles::numeric,1)
 from evaluated;
$$;

create function public.refresh_matches(p_org uuid) returns void language sql security definer set search_path='' as $$
 insert into public.matches(organization_id,need_id,volunteer_id,score,reasons,distance)
 select p_org,* from public.score_matches(p_org)
 on conflict(need_id,volunteer_id) do update set score=excluded.score,reasons=excluded.reasons,distance=excluded.distance,calculated_at=now();
$$;

-- Each wave expands incrementally (3, then 6, then 9...) and never broadcasts.
-- Lock order is need -> volunteer throughout; concurrent invocations skip locked needs.
create function public.prepare_waves(p_org uuid) returns int language plpgsql security definer set search_path='' as $$
declare n public.needs; v record; sent int:=0; picked int; used int; existing uuid; digest_at timestamptz; digest_key text;
begin
 for n in select * from public.needs where organization_id=p_org and status='open' and approved_at is not null and needed_by>now() and coalesce(next_wave_at,approved_at)<=now() order by approved_at limit 30 for update skip locked loop
  picked:=0;
  for v in select vol.*,m.score from public.matches m join public.volunteers vol on vol.id=m.volunteer_id
    where m.need_id=n.id and m.notified_at is null and m.score>=20 and vol.frequency<>'off'
    and vol.capability_tags&&n.capability_tags and (m.distance is null or m.distance<=60 or n.category='funds')
    and (n.window_start is null or jsonb_array_length(vol.availability)=0 or exists(select 1 from jsonb_array_elements(vol.availability) w where (w->>'start')::timestamptz<=n.window_start and (w->>'end')::timestamptz>=n.window_end))
    order by m.score desc,vol.id for update of vol skip locked loop
   exit when picked>=least(3*(n.wave+1),30);
   digest_at:=((date_trunc('day',now() at time zone 'America/New_York')+interval '1 day 9 hours') at time zone 'America/New_York');
   digest_key:='digest:'||v.id||':'||(digest_at at time zone 'America/New_York')::date;
   existing:=null;
   if v.frequency='digest' then select id into existing from public.notifications where dedupe_key=digest_key and status='queued' for update; end if;
   if existing is not null then
    update public.notifications set payload=jsonb_set(payload,'{need_ids}',(payload->'need_ids')||to_jsonb(n.id)) where id=existing;
   else
    select count(*) into used from public.notifications where volunteer_id=v.id and kind in ('match','digest','reminder') and status in ('queued','sending','sent')
     and send_after>=case when v.frequency='digest' then digest_at-interval '9 hours' else now()-interval '24 hours' end
     and send_after<case when v.frequency='digest' then digest_at+interval '15 hours' else now()+interval '24 hours' end;
    if used>=v.daily_cap then continue; end if;
    insert into public.notifications(organization_id,volunteer_id,need_id,kind,payload,dedupe_key,send_after)
     values(p_org,v.id,case when v.frequency='instant' then n.id end,case when v.frequency='instant' then 'match' else 'digest' end,
     jsonb_build_object('need_ids',jsonb_build_array(n.id)),case when v.frequency='instant' then 'match:'||n.id||':'||v.id else digest_key end,
     case when v.frequency='instant' then now() else digest_at end) on conflict(dedupe_key) do nothing;
   end if;
   update public.matches set notified_at=now() where need_id=n.id and volunteer_id=v.id;
   picked:=picked+1; sent:=sent+1;
  end loop;
  update public.needs set wave=wave+1,next_wave_at=now()+case urgency when 'critical' then interval '15 minutes' when 'soon' then interval '4 hours' else interval '24 hours' end where id=n.id;
 end loop;
 return sent;
end; $$;

create function public.reserve_notifications(p_org uuid) returns setof public.notifications language plpgsql security definer set search_path='' as $$
begin
 update public.notifications set status='failed',last_error='Delivery lease expired after the final attempt.'
 where organization_id=p_org and status='sending' and lease_until<now() and attempts>=5;
 return query update public.notifications set status='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1
 where id in (select id from public.notifications where organization_id=p_org and send_after<=now() and attempts<5 and (status='queued' or (status='sending' and lease_until<now())) order by send_after limit 30 for update skip locked)
 returning *;
end; $$;

create function public.transition_need(p_org uuid,p_need uuid,p_user uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare n public.needs;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Caseworker access required'; end if;
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if n.status='pending' and p_status='open' then
  update public.needs set status='open',approved_at=now(),approved_by=p_user,next_wave_at=now() where id=p_need;
 elsif n.status='claimed' and p_status='completed' then
  update public.needs set status='completed',completed_at=now() where id=p_need;
  update public.claims set completed_at=now() where need_id=p_need;
 else raise exception 'This status change is not allowed'; end if;
end; $$;

create function public.queue_reminder(p_org uuid,p_need uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.claims; v public.volunteers; used int;
begin
 perform 1 from public.needs where id=p_need and organization_id=p_org and status='claimed' for update;
 if not found then return false; end if;
 select * into c from public.claims where need_id=p_need;
 select * into v from public.volunteers where id=c.volunteer_id for update;
 select count(*) into used from public.notifications where volunteer_id=v.id and kind in ('match','digest','reminder') and status in ('queued','sending','sent') and send_after>now()-interval '24 hours';
 if used>=v.daily_cap then return false; end if;
 insert into public.notifications(organization_id,volunteer_id,need_id,kind,dedupe_key)
 values(p_org,v.id,p_need,'reminder','reminder:'||p_need||':'||current_date) on conflict(dedupe_key) do nothing;
 return found;
end; $$;

-- PostgREST must never expose privileged RPCs to anonymous/authenticated callers.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
