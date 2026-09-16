import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the customer demo.");
}

const client = new Client({ connectionString });
const configuredOrganizationId = process.env.SHEAF_ORG_ID;

const volunteers = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    name: "Jordan Lee",
    email: "jordan.lee@bridge-demo.invalid",
    location: "State College, PA",
    capabilityTags: ["helping hands", "meals"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    name: "Morgan Davis",
    email: "morgan.davis@bridge-demo.invalid",
    location: "Bellefonte, PA",
    capabilityTags: ["goods", "transportation"],
  },
];

const needs = [
  {
    id: "d1000000-0000-4000-8000-000000000001",
    title: "Safe crib and mattress for a new placement",
    category: "goods",
    description:
      "A licensed foster home is welcoming an infant this week and needs a new crib and mattress before placement day.",
    urgency: "critical",
    county: "Centre",
    ways: ["Provide a new crib and mattress", "Coordinate store pickup"],
    tags: ["goods", "helping hands"],
    daysUntilNeeded: 3,
    status: "pending",
    quantity: 1,
    unit: "crib set",
    location: "State College community center",
    poster: "Jamie · Family Support Coordinator",
  },
  {
    id: "d1000000-0000-4000-8000-000000000002",
    title: "Ride to a pediatric follow-up appointment",
    category: "transportation",
    description:
      "A caregiver needs round-trip transportation to a scheduled pediatric appointment. A child safety seat is already available.",
    urgency: "critical",
    county: "Centre",
    ways: ["Provide round-trip transportation"],
    tags: ["transportation"],
    daysUntilNeeded: 5,
    status: "open",
    quantity: 1,
    unit: "ride",
    location: "Bellefonte public library",
    poster: "Avery · Family Support Coordinator",
  },
  {
    id: "d1000000-0000-4000-8000-000000000003",
    title: "Welcome-home meal train",
    category: "meals",
    description:
      "Three ready-to-heat dinners will give a kinship caregiver some breathing room during the family's first week together.",
    urgency: "soon",
    county: "Blair",
    ways: ["Prepare a family-sized dinner", "Provide a grocery gift card"],
    tags: ["meals"],
    daysUntilNeeded: 8,
    status: "open",
    quantity: 3,
    unit: "dinner",
    location: "Hollidaysburg community center",
    poster: "Taylor · Kinship Care Coordinator",
  },
  {
    id: "d1000000-0000-4000-8000-000000000004",
    title: "Twin-bed starter kits for two siblings",
    category: "goods",
    description:
      "Two school-age siblings need complete twin bedding sets, including sheets, pillows, and comforters.",
    urgency: "flexible",
    county: "Huntingdon",
    ways: ["Provide a complete bedding set", "Purchase items from the shared list"],
    tags: ["goods"],
    daysUntilNeeded: 14,
    status: "open",
    quantity: 2,
    unit: "bedding set",
    location: "Huntingdon borough office",
    poster: "Riley · Resource Coordinator",
  },
  {
    id: "d1000000-0000-4000-8000-000000000005",
    title: "Grocery delivery for a reunifying family",
    category: "helping hands",
    description:
      "A volunteer has committed to pick up and deliver a prepared grocery order before the family returns home.",
    urgency: "soon",
    county: "Centre",
    ways: ["Pick up and deliver the grocery order"],
    tags: ["helping hands"],
    daysUntilNeeded: 6,
    status: "claimed",
    quantity: 1,
    unit: "delivery",
    location: "State College public pickup point",
    poster: "Jamie · Family Support Coordinator",
    volunteerId: volunteers[0].id,
  },
  {
    id: "d1000000-0000-4000-8000-000000000006",
    title: "Winter coats for three siblings",
    category: "goods",
    description:
      "A volunteer is gathering three new winter coats in the requested sizes for siblings entering care.",
    urgency: "soon",
    county: "Clinton",
    ways: ["Provide the three requested coats"],
    tags: ["goods"],
    daysUntilNeeded: 10,
    status: "claimed",
    quantity: 3,
    unit: "coat",
    location: "Lock Haven community center",
    poster: "Morgan · Placement Coordinator",
    volunteerId: volunteers[1].id,
  },
];

await client.connect();

try {
  await client.query("begin");

  const organizationResult = configuredOrganizationId
    ? await client.query("select id from public.organizations where id = $1", [
        configuredOrganizationId,
      ])
    : await client.query(
        "select id from public.organizations order by created_at limit 1",
      );

  if (organizationResult.rowCount !== 1) {
    throw new Error("Could not resolve exactly one Bridge organization.");
  }

  const organizationId = organizationResult.rows[0].id;

  for (const volunteer of volunteers) {
    await client.query(
      `insert into public.volunteers
        (id, organization_id, name, email, location, capability_tags, frequency)
       values ($1, $2, $3, $4, $5, $6, 'off')
       on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        location = excluded.location,
        capability_tags = excluded.capability_tags,
        frequency = 'off'`,
      [
        volunteer.id,
        organizationId,
        volunteer.name,
        volunteer.email,
        volunteer.location,
        volunteer.capabilityTags,
      ],
    );
  }

  for (const need of needs) {
    const approvedAt = need.status === "pending" ? null : new Date();
    const committed = need.status === "claimed" ? need.quantity : 0;

    await client.query(
      `insert into public.needs
        (id, organization_id, title, category, description, urgency,
         service_area, ways_to_help, capability_tags, needed_by, status,
         approved_at, quantity_required, quantity_committed, unit_label,
         public_location, poster_name, created_at, next_wave_at)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         now() + ($10 * interval '1 day'), $11, $12, $13, $14, $15,
         $16, $17, now() - interval '2 hours',
         case when $11 = 'open' then now() + interval '30 days' else null end)
       on conflict (id) do update set
        title = excluded.title,
        category = excluded.category,
        description = excluded.description,
        urgency = excluded.urgency,
        service_area = excluded.service_area,
        ways_to_help = excluded.ways_to_help,
        capability_tags = excluded.capability_tags,
        needed_by = excluded.needed_by,
        status = excluded.status,
        approved_at = excluded.approved_at,
        completed_at = null,
        quantity_required = excluded.quantity_required,
        quantity_committed = excluded.quantity_committed,
        quantity_received = 0,
        unit_label = excluded.unit_label,
        public_location = excluded.public_location,
        poster_name = excluded.poster_name,
        next_wave_at = excluded.next_wave_at`,
      [
        need.id,
        organizationId,
        need.title,
        need.category,
        need.description,
        need.urgency,
        need.county,
        need.ways,
        need.tags,
        need.daysUntilNeeded,
        need.status,
        approvedAt,
        need.quantity,
        committed,
        need.unit,
        need.location,
        need.poster,
      ],
    );

    if (need.status === "claimed") {
      await client.query(
        `insert into public.claims
          (id, organization_id, need_id, volunteer_id, way, quantity,
           fulfilled_quantity, created_at)
         values
          (md5($1::text || ':claim')::uuid, $2, $1::uuid, $3, $4, $5, 0,
           now() - interval '1 day')
         on conflict (need_id, volunteer_id) do update set
          way = excluded.way,
          quantity = excluded.quantity,
          fulfilled_quantity = 0,
          reported_quantity = null,
          completed_at = null`,
        [
          need.id,
          organizationId,
          need.volunteerId,
          need.ways[0],
          need.quantity,
        ],
      );
    }
  }

  await client.query("commit");
  console.log(
    "Customer demo seeded: 1 awaiting approval, 3 open, 2 claimed; no emails queued.",
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
