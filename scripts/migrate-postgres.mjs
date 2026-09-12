import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query(`
    create schema if not exists auth;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table if not exists public.bridge_migrations(
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query("select version from public.bridge_migrations")).rows.map((row) => row.version),
  );
  const files = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(`supabase/migrations/${file}`, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.bridge_migrations(version) values($1)", [file]);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const contact = process.env.BRIDGE_CONTACT_EMAIL;
  if (contact) {
    await client.query(
      `insert into public.organizations(id,name,service_area,contact_email,ein)
       values($1,$2,$3,$4,$5)
       on conflict(id) do update set name=excluded.name,service_area=excluded.service_area,
         contact_email=excluded.contact_email,ein=coalesce(excluded.ein,public.organizations.ein)`,
      [
        process.env.SHEAF_ORG_ID,
        process.env.BRIDGE_ORGANIZATION_NAME || "Keystone Family Alliance",
        process.env.BRIDGE_SERVICE_AREA || "Pennsylvania",
        contact,
        process.env.BRIDGE_EIN || null,
      ],
    );
    console.log("Configured the Bridge organization record.");
  }
  console.log("Bridge PostgreSQL migrations are current.");
} finally {
  client.release();
  await pool.end();
}
