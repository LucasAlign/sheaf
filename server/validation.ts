import { z } from "zod";
import { categories } from "../src/types";
import { counties } from "../src/counties";
const line = (max: number) => z.string().trim().min(1).max(max);
export const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const uuid = z.uuid();
const date = z.iso.datetime({ offset: true });
const window = z
  .object({ start: date, end: date })
  .refine(
    (w) => Date.parse(w.end) > Date.parse(w.start),
    "Availability must end after it starts",
  );
export const profileSchema = z
  .object({
    name: line(100),
    email,
    location: z.string().max(100),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    capability_tags: z.array(z.enum(categories)).max(5),
    availability: z.array(window).max(10),
    frequency: z.enum(["instant", "digest", "off"]),
    daily_cap: z.number().int().min(1).max(3),
  })
  .strict()
  .refine(
    (p) => (p.latitude === null) === (p.longitude === null),
    "Both coordinates are required",
  );
export const needSchema = z
  .object({
    title: line(120),
    category: z.enum(categories),
    description: line(2000),
    urgency: z.enum(["critical", "soon", "flexible"]),
    service_area: z
      .string()
      .refine((s) => counties.includes(s), "Choose a Pennsylvania county"),
    ways_to_help: z.array(line(100)).min(1).max(8),
    capability_tags: z.array(z.enum(categories)).min(1).max(5),
    needed_by: date.refine(
      (s) => Date.parse(s) > Date.now(),
      "The needed-by date must be in the future",
    ),
    window_start: date.nullable(),
    window_end: date.nullable(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    quantity_required: z.number().int().min(1).max(10000).default(1),
    unit_label: line(40).default('item'),
    public_location: line(200),
    poster_name: line(100),
    photo_path: z.string().max(500).nullable().optional(),
    photo_alt: z.string().trim().max(200).default(''),
  })
  .strict()
  .refine(
    (p) => (p.latitude === undefined) === (p.longitude === undefined),
    "Both coordinates are required",
  )
  .refine(
    (p) =>
      (p.window_start === null && p.window_end === null) ||
      (p.window_start !== null &&
        p.window_end !== null &&
        Date.parse(p.window_end) > Date.parse(p.window_start)),
    "Choose a valid service window",
  );
export const claimSchema = z.object({ need_id: uuid, way: line(100),quantity:z.number().int().min(1).max(10000).default(1) }).strict();
export const magicSchema = z
  .object({
    email,
    name: line(100),
    need_id: uuid.optional(),
    way: line(100).optional(),
    quantity:z.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((p) => !!p.need_id === !!p.way, "A claim needs a way to help");
export const receiptSchema = z.object({ need_id: uuid }).strict();
export const giftSchema = z
  .object({
    request_id: uuid,
    quantity:z.number().int().min(1).max(10000),
    kind: z.enum(["goods", "funds"]),
    amount_cents: z.number().int().min(0).max(100000000),
    description: line(500),
    received_at: date.refine(
      (d) => Date.parse(d) <= Date.now(),
      "Use the date the contribution was received",
    ),
  })
  .strict()
  .refine(
    (v) => v.kind !== "funds" || v.amount_cents > 0,
    "Funds must have an amount received",
  );
export const contributionSchema=z.object({claim_id:uuid,gift:giftSchema}).strict();
export const confirmSchema=z.object({claim_id:uuid,quantity:z.number().int().min(0).max(10000),release_remainder:z.boolean(),gift:giftSchema.nullable().optional()}).strict();
export const reportSchema=z.object({from:z.iso.date(),to:z.iso.date(),county:z.string().max(100).nullable().default(null),donor_id:uuid.nullable().default(null)}).strict().refine(p=>p.from<=p.to,'Choose a valid report date range');
