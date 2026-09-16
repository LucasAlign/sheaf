export const categories = [
  "goods",
  "transportation",
  "meals",
  "helping hands",
  "funds",
] as const;
export type Category = (typeof categories)[number];
export type Urgency = "critical" | "soon" | "flexible";
export type Status = "open" | "claimed" | "completed";
export type Need = {
  id: string;
  title: string;
  category: Category;
  description: string;
  urgency: Urgency;
  service_area: string;
  ways_to_help: string[];
  capability_tags: string[];
  status: Status;
  approved_at: string | null;
  created_at: string;
  needed_by: string;
  window_start: string | null;
  window_end: string | null;
  latitude?: number;
  longitude?: number;
  distance?: number;
  score?: number;
  reasons?: string[];
  claimed_by_me?: boolean;
  quantity_required?: number;
  quantity_committed?: number;
  quantity_received?: number;
  unit_label?: string;
  public_location?: string;
  poster_name?: string;
  photo_path?: string | null;
  photo_url?: string | null;
  photo_alt?: string;
  photo_approved_at?: string | null;
};
export type Claim = {id:string;need_id:string;volunteer_id:string;name:string;email:string;way:string;quantity:number;fulfilled_quantity:number;reported_quantity:number|null;receipted_quantity:number;created_at:string;completed_at:string|null};
export type Gift = {id:string;claim_id?:string;received_at:string;kind:'goods'|'funds';quantity:number;amount_cents:number|null;description:string;donor_id:string;donor_name:string;donor_email:string;title:string;service_area:string;receipt_status:string|null};
export type Statement = {id:string;year:number;generated_at:string;snapshot:StatementSnapshot;email_status?:string};
export type StatementSnapshot = {year:number;organization:string;ein:string;contact_email:string;donor_name:string;donor_email:string;cash_cents:number;contributions:Pick<Gift,'id'|'received_at'|'kind'|'quantity'|'amount_cents'|'description'>[]};
export type ReportData = {contributions:Gift[];needs:Need[]};
export type Profile = {
  name: string;
  email: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  capability_tags: string[];
  availability: { start: string; end: string }[];
  frequency: "instant" | "digest" | "off";
  daily_cap: number;
};
export type Organization = {
  id: string;
  name: string;
  service_area: string;
  ein?: string;
  contact_email?: string;
};
export const emptyProfile: Profile = {
  name: "",
  email: "",
  location: "",
  latitude: null,
  longitude: null,
  capability_tags: [],
  availability: [],
  frequency: "off",
  daily_cap: 2,
};
