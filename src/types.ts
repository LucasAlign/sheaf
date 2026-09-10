export const categories = ['goods', 'transportation', 'meals', 'helping hands', 'funds'] as const;
export type Category = typeof categories[number];
export type Urgency = 'critical' | 'soon' | 'flexible';
export type Status = 'pending' | 'open' | 'claimed' | 'completed';
export type Need = { id: string; title: string; category: Category; description: string; urgency: Urgency; service_area: string; ways_to_help: string[]; capability_tags: string[]; status: Status; approved_at: string | null; created_at: string; needed_by: string; window_start: string | null; window_end: string | null; latitude?: number; longitude?: number; distance?: number; score?: number; reasons?: string[]; claimed_by_me?: boolean };
export type Profile = { name: string; email: string; location: string; latitude: number | null; longitude: number | null; capability_tags: string[]; availability: { start: string; end: string }[]; frequency: 'instant' | 'digest' | 'off'; daily_cap: number };
export type Organization = { id: string; name: string; service_area: string; ein?: string; contact_email?: string };
export const emptyProfile: Profile = { name: '', email: '', location: '', latitude: null, longitude: null, capability_tags: [], availability: [], frequency: 'off', daily_cap: 2 };
