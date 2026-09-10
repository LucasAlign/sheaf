-- Upgrade existing single-claim needs without losing commitments or contributions.
alter table public.needs add column quantity_required integer not null default 1 check(quantity_required between 1 and 10000);
alter table public.needs add column quantity_committed integer not null default 0;
alter table public.needs add column quantity_received integer not null default 0;
alter table public.needs add column unit_label text not null default 'item' check(length(unit_label) between 1 and 40);
alter table public.needs add column public_location text not null default '' check(length(public_location)<=200);
alter table public.needs add column poster_name text not null default '' check(length(poster_name)<=100);
alter table public.needs add column photo_path text;
alter table public.needs add column photo_alt text not null default '' check(length(photo_alt)<=200);
alter table public.needs add column photo_approved_at timestamptz;
alter table public.claims drop constraint claims_need_id_key;
alter table public.claims add constraint claims_one_volunteer_per_need unique(need_id,volunteer_id);
alter table public.claims add column quantity integer not null default 1 check(quantity between 0 and 10000);
alter table public.claims add column fulfilled_quantity integer not null default 0;
alter table public.claims add column reported_quantity integer;
alter table public.claims add column confirmed_by uuid references auth.users(id);
alter table public.claims add constraint claim_quantities_valid check(fulfilled_quantity between 0 and quantity and (reported_quantity is null or reported_quantity between fulfilled_quantity and quantity));
update public.claims set fulfilled_quantity=quantity where completed_at is not null;
update public.needs n set quantity_committed=(select coalesce(sum(c.quantity),0) from public.claims c where c.need_id=n.id),quantity_received=(select coalesce(sum(c.fulfilled_quantity),0) from public.claims c where c.need_id=n.id);
alter table public.needs add constraint need_quantities_valid check(quantity_received between 0 and quantity_committed and quantity_committed<=quantity_required);
alter table public.magic_links add column quantity integer not null default 1 check(quantity between 1 and 10000);
alter table public.contributions drop constraint contributions_claim_id_key;
alter table public.contributions add column quantity integer not null default 1 check(quantity between 1 and 10000);
alter table public.contributions add column request_id uuid not null default gen_random_uuid() unique;
alter table public.notifications alter column volunteer_id drop not null;
alter table public.notifications add column recipient_user_id uuid references auth.users(id);
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in ('match','digest','reminder','claim_confirmation','need_completed','donation_receipt','annual_statement'));
alter table public.notifications add constraint notification_recipient check(
 (kind='need_completed' and volunteer_id is null) or
 (kind<>'need_completed' and volunteer_id is not null and recipient_user_id is null)
);

create table public.donor_statements (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,volunteer_id uuid not null,
 year integer not null check(year between 2000 and 9999),snapshot jsonb not null,content_hash text not null,
 generated_at timestamptz not null default now(),unique(organization_id,volunteer_id,year),
 foreign key(organization_id,volunteer_id) references public.volunteers(organization_id,id)
);
alter table public.donor_statements enable row level security;
revoke all on public.donor_statements from anon,authenticated;
grant all on public.donor_statements to service_role;
grant select(quantity_required,quantity_committed,quantity_received,unit_label,public_location,poster_name,photo_alt) on public.needs to anon,authenticated;

create function public.sync_need_quantities(p_org uuid,p_need uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.needs; committed integer; received integer; next_status text;
begin
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if not found then raise exception 'Need not found'; end if;
 select coalesce(sum(quantity),0),coalesce(sum(fulfilled_quantity),0) into committed,received from public.claims where need_id=p_need;
 if committed>n.quantity_required then raise exception 'Not enough quantity remains'; end if;
 next_status:=case when n.status='pending' then 'pending' when received=n.quantity_required then 'completed' when committed=n.quantity_required then 'claimed' else 'open' end;
 update public.needs set quantity_committed=committed,quantity_received=received,status=next_status,
 completed_at=case when next_status='completed' then coalesce(completed_at,now()) else null end,
 next_wave_at=case when next_status='open' then coalesce(next_wave_at,now()) else null end where id=p_need;
 if next_status in ('claimed','completed') then update public.notifications set status='cancelled' where need_id=p_need and kind='match' and status='queued'; end if;
 if next_status='completed' and n.status<>'completed' then
  insert into public.notifications(organization_id,recipient_user_id,need_id,kind,dedupe_key,payload)
  values(p_org,n.created_by,p_need,'need_completed','completed:'||p_need||':'||n.quantity_required,
   jsonb_build_object('title',n.title,'quantity',n.quantity_required,'unit_label',n.unit_label)) on conflict(dedupe_key) do nothing;
 end if;
end; $$;

drop function public.claim_need(uuid,uuid,uuid,text);
create function public.claim_need(p_org uuid,p_need uuid,p_volunteer uuid,p_way text,p_quantity integer default 1) returns uuid language plpgsql security definer set search_path='' as $$
declare n public.needs;c public.claims;cid uuid;
begin
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if not found then raise exception 'Need not found'; end if;
 select * into c from public.claims where need_id=p_need and volunteer_id=p_volunteer;
 if found and c.quantity>0 then return c.id; end if;
 if n.status<>'open' or n.approved_at is null or n.needed_by<now() then raise exception 'This need is no longer available'; end if;
 if not p_way=any(n.ways_to_help) then raise exception 'Choose a listed way to help'; end if;
 if p_quantity<1 or p_quantity>n.quantity_required-n.quantity_committed then raise exception 'Not enough quantity remains'; end if;
 insert into public.claims(organization_id,need_id,volunteer_id,way,quantity) values(p_org,p_need,p_volunteer,p_way,p_quantity)
 on conflict(need_id,volunteer_id) do update set quantity=excluded.quantity,way=excluded.way,completed_at=null returning id into cid;
 perform public.sync_need_quantities(p_org,p_need);
 insert into public.notifications(organization_id,volunteer_id,need_id,kind,dedupe_key,payload)
 values(p_org,p_volunteer,p_need,'claim_confirmation','claim:'||cid,jsonb_build_object('claim_id',cid)) on conflict(dedupe_key) do nothing;
 return cid;
end; $$;

create or replace function public.redeem_magic_link(p_org uuid,p_hash text,p_session_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.magic_links;vid uuid;
begin
 select * into l from public.magic_links where token_hash=p_hash and organization_id=p_org for update;
 if not found or l.expires_at<now() or l.consumed_at is not null then raise exception 'This link has expired or has already been used'; end if;
 insert into public.volunteers(organization_id,name,email) values(p_org,l.name,l.email) on conflict(organization_id,email) do update set verified_at=now() returning id into vid;
 if l.need_id is not null then perform public.claim_need(p_org,l.need_id,vid,l.way,l.quantity); end if;
 update public.magic_links set consumed_at=now() where token_hash=p_hash;
 insert into public.volunteer_sessions values(p_session_hash,p_org,vid,now()+interval '30 days');return vid;
end; $$;

create function public.report_delivery(p_org uuid,p_claim uuid,p_volunteer uuid,p_quantity integer) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.claims set reported_quantity=p_quantity where id=p_claim and organization_id=p_org and volunteer_id=p_volunteer and p_quantity>fulfilled_quantity and p_quantity<=quantity;
 if not found then raise exception 'Choose a valid delivered quantity for your claim'; end if;
end; $$;

create function public.record_contribution(p_org uuid,p_claim uuid,p_user uuid,p_gift jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.claims;gift_id uuid;recorded integer;qty integer;org public.organizations;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Caseworker access required'; end if;
 select * into c from public.claims where id=p_claim and organization_id=p_org for update;
 if not found then raise exception 'Claim not found'; end if;
 select id into gift_id from public.contributions where request_id=(p_gift->>'request_id')::uuid and organization_id=p_org and claim_id=p_claim;
 if found then return gift_id; end if;
 select * into org from public.organizations where id=p_org;
 if nullif(trim(org.ein),'') is null then raise exception 'Configure the organization EIN before emailing donation receipts'; end if;
 qty:=(p_gift->>'quantity')::integer;
 select coalesce(sum(quantity),0) into recorded from public.contributions where claim_id=p_claim;
 if qty<1 or recorded+qty>c.fulfilled_quantity then raise exception 'Receipts cannot exceed confirmed contributions'; end if;
 if (p_gift->>'received_at')::timestamptz>now() then raise exception 'Use the date the contribution was received'; end if;
 insert into public.contributions(organization_id,claim_id,kind,amount_cents,description,received_at,recorded_by,quantity,request_id)
 values(p_org,p_claim,p_gift->>'kind',case when p_gift->>'kind'='funds' then (p_gift->>'amount_cents')::bigint end,p_gift->>'description',(p_gift->>'received_at')::timestamptz,p_user,qty,(p_gift->>'request_id')::uuid) returning id into gift_id;
 insert into public.notifications(organization_id,volunteer_id,need_id,kind,dedupe_key,payload)
 values(p_org,c.volunteer_id,c.need_id,'donation_receipt','receipt:'||gift_id,jsonb_build_object('contribution_id',gift_id));
 return gift_id;
end; $$;

create function public.confirm_delivery(p_org uuid,p_claim uuid,p_user uuid,p_quantity integer,p_release boolean default false,p_gift jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.claims; nid uuid;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Caseworker access required'; end if;
 select need_id into nid from public.claims where id=p_claim and organization_id=p_org;
 perform 1 from public.needs where id=nid and organization_id=p_org for update;
 select * into c from public.claims where id=p_claim and organization_id=p_org for update;
 if not found then raise exception 'Claim not found'; end if;
 if p_quantity<c.fulfilled_quantity or p_quantity>c.quantity then raise exception 'Confirmed quantity must be within the commitment'; end if;
 update public.claims set fulfilled_quantity=p_quantity,quantity=case when p_release then p_quantity else quantity end,reported_quantity=null,confirmed_by=p_user,
 completed_at=case when p_release or p_quantity=quantity then now() else null end where id=p_claim;
 if p_gift is not null then perform public.record_contribution(p_org,p_claim,p_user,p_gift); end if;
 perform public.sync_need_quantities(p_org,nid);
end; $$;

create function public.update_need_quantity(p_org uuid,p_need uuid,p_user uuid,p_quantity integer) returns void language plpgsql security definer set search_path='' as $$
declare n public.needs;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Caseworker access required'; end if;
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if p_quantity<n.quantity_committed or p_quantity<1 or p_quantity>10000 then raise exception 'Requested quantity cannot be below existing commitments'; end if;
 update public.needs set quantity_required=p_quantity where id=p_need;
 perform public.sync_need_quantities(p_org,p_need);
end; $$;

create or replace function public.transition_need(p_org uuid,p_need uuid,p_user uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare n public.needs;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Caseworker access required'; end if;
 select * into n from public.needs where id=p_need and organization_id=p_org for update;
 if n.status='pending' and p_status='open' then
  update public.needs set status='open',approved_at=now(),approved_by=p_user,next_wave_at=now(),photo_approved_at=case when photo_path is not null then now() end where id=p_need;
 elsif p_status='completed' then raise exception 'Confirm each delivery before completing the need';
 else raise exception 'This status change is not allowed'; end if;
end; $$;

create function public.queue_need_reminders(p_org uuid,p_need uuid,p_before timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.claims;v public.volunteers;used integer;inserted integer;total integer:=0;
begin
 perform 1 from public.needs where id=p_need and organization_id=p_org and status in ('open','claimed') for update;
 if not found then return false; end if;
 for c in select * from public.claims where need_id=p_need and quantity>fulfilled_quantity and (p_before is null or created_at<p_before) loop
  select * into v from public.volunteers where id=c.volunteer_id for update;
  select count(*) into used from public.notifications where volunteer_id=v.id and kind in ('match','digest','reminder') and status in ('queued','sending','sent') and send_after>now()-interval '24 hours';
  if used>=v.daily_cap then continue; end if;
  insert into public.notifications(organization_id,volunteer_id,need_id,kind,dedupe_key,payload)
  values(p_org,v.id,p_need,'reminder','reminder:'||c.id||':'||current_date,jsonb_build_object('claim_id',c.id)) on conflict(dedupe_key) do nothing;
  get diagnostics inserted=row_count;total:=total+inserted;
 end loop;return total>0;
end; $$;
create or replace function public.queue_reminder(p_org uuid,p_need uuid) returns boolean language sql security definer set search_path='' as $$ select public.queue_need_reminders(p_org,p_need,null); $$;
create or replace function public.prepare_reminders(p_org uuid) returns int language plpgsql security definer set search_path='' as $$
declare n record;queued int:=0;
begin
 for n in select id from public.needs where organization_id=p_org and status in ('open','claimed') and exists(select 1 from public.claims c where c.need_id=needs.id and c.quantity>c.fulfilled_quantity and c.created_at<now()-interval '48 hours') order by created_at limit 30 for update skip locked loop
  if public.queue_need_reminders(p_org,n.id,now()-interval '48 hours') then queued:=queued+1; end if;
 end loop;return queued;
end; $$;
create or replace function public.delivery_allowed(p_org uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;cap int;preceding int;
begin
 select * into n from public.notifications where id=p_id and organization_id=p_org;
 if not found or n.status<>'sending' then return false; end if;
 if n.kind in ('claim_confirmation','donation_receipt','annual_statement','need_completed') then return true; end if;
 select daily_cap into cap from public.volunteers where id=n.volunteer_id for update;
 select count(*) into preceding from public.notifications where volunteer_id=n.volunteer_id and id<>n.id and kind in ('match','digest','reminder') and ((status='sent' and sent_at>now()-interval '24 hours') or (status='sending' and (created_at,id)<(n.created_at,n.id)));
 return preceding<cap;
end; $$;

-- Snapshot donor statements, including a revision-specific idempotent email.
create function public.prepare_annual_statements(p_org uuid,p_year integer) returns integer language plpgsql security definer set search_path='' as $$
declare donor record;doc jsonb;hash text;previous_hash text;sid uuid;queued integer:=0;org public.organizations;
begin
 if p_year<2000 or p_year>=extract(year from now() at time zone 'America/New_York') then raise exception 'Choose a completed calendar year'; end if;
 select * into org from public.organizations where id=p_org for update;
 if nullif(trim(org.ein),'') is null then return 0; end if;
 for donor in select distinct v.id,v.name,v.email from public.volunteers v join public.claims c on c.volunteer_id=v.id join public.contributions g on g.claim_id=c.id
 where g.organization_id=p_org and extract(year from g.received_at at time zone 'America/New_York')=p_year loop
  select jsonb_build_object('year',p_year,'organization',org.name,'ein',org.ein,'contact_email',org.contact_email,'donor_name',donor.name,'donor_email',donor.email,
   'cash_cents',coalesce(sum(case when g.kind='funds' then g.amount_cents else 0 end),0),
   'contributions',jsonb_agg(jsonb_build_object('id',g.id,'received_at',g.received_at,'kind',g.kind,'quantity',g.quantity,'description',g.description,'amount_cents',g.amount_cents) order by g.received_at,g.id)) into doc
  from public.contributions g join public.claims c on c.id=g.claim_id where g.organization_id=p_org and c.volunteer_id=donor.id and extract(year from g.received_at at time zone 'America/New_York')=p_year;
  hash:=encode(extensions.digest(doc::text,'sha256'),'hex');previous_hash:=null;
  select content_hash into previous_hash from public.donor_statements where organization_id=p_org and volunteer_id=donor.id and year=p_year;
  if previous_hash=hash then continue; end if;
  insert into public.donor_statements(organization_id,volunteer_id,year,snapshot,content_hash) values(p_org,donor.id,p_year,doc,hash)
  on conflict(organization_id,volunteer_id,year) do update set snapshot=excluded.snapshot,content_hash=excluded.content_hash,generated_at=now() returning id into sid;
  update public.notifications set status='cancelled' where organization_id=p_org and kind='annual_statement' and payload->>'statement_id'=sid::text and status='queued';
  insert into public.notifications(organization_id,volunteer_id,kind,dedupe_key,payload)
  values(p_org,donor.id,'annual_statement','annual:'||sid||':'||hash,jsonb_build_object('statement_id',sid,'snapshot',doc)) on conflict(dedupe_key) do nothing;
  queued:=queued+1;
 end loop;return queued;
end; $$;

create function public.run_reports(p_org uuid,p_from date,p_to date,p_county text default null,p_donor uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'contributions',coalesce((select jsonb_agg(row_to_json(gifts) order by gifts.received_at desc) from (
 select g.id,g.received_at,g.kind,g.quantity,g.amount_cents,g.description,v.id donor_id,v.name donor_name,v.email donor_email,n.title,n.service_area,
 (select status from public.notifications where dedupe_key='receipt:'||g.id) receipt_status
 from public.contributions g join public.claims c on c.id=g.claim_id join public.volunteers v on v.id=c.volunteer_id join public.needs n on n.id=c.need_id
 where g.organization_id=p_org and (g.received_at at time zone 'America/New_York')::date between p_from and p_to and (p_county is null or n.service_area=p_county) and (p_donor is null or v.id=p_donor)
 ) gifts),'[]'::jsonb),
 'needs',coalesce((select jsonb_agg(row_to_json(report_needs) order by report_needs.created_at desc) from (
 select n.id,n.title,n.status,n.service_area,n.poster_name,n.quantity_required,n.quantity_committed,n.quantity_received,n.unit_label,n.created_at,n.completed_at
 from public.needs n where n.organization_id=p_org and (n.created_at at time zone 'America/New_York')::date between p_from and p_to and (p_county is null or n.service_area=p_county) and (p_donor is null or exists(select 1 from public.claims c where c.need_id=n.id and c.volunteer_id=p_donor))
 ) report_needs),'[]'::jsonb));
$$;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on all functions in schema public to service_role;
