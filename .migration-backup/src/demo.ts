import type { Need, Organization } from './types';
export const demoOrg: Organization = { id: 'demo', name: 'Keystone Family Alliance', service_area: 'Pennsylvania', contact_email: 'care@example.org' };
const now = Date.now();
const day = (days: number) => new Date(now + days * 86400000).toISOString();
const rows = [
  ['A soft landing for two little ones', 'goods', 'Two siblings are settling into a new foster home. A twin bed frame and new bedding will help make their room feel like their own.', 'soon', 'North Raleigh', ['Donate a twin bed', 'Provide new bedding'], 3.2, ['goods'], 3],
  ['A ride that keeps a family connected', 'transportation', 'Help a parent get to a scheduled family visit. A caseworker will coordinate the pickup details privately with an approved driver.', 'critical', 'Downtown Raleigh', ['Offer a round-trip ride'], 5.4, ['transportation'], 1],
  ['Dinner off their plate this week', 'meals', 'A family welcomed a new placement this week. A ready-to-heat dinner for five would give them a little more time together.', 'soon', 'Cary', ['Cook a family meal', 'Send a meal gift card'], 8.1, ['meals'], 2],
  ['A fresh start, one box at a time', 'helping hands', 'Lend a hand moving a dresser and a few boxes into a foster family’s home. About two hours, with the caseworker there to help.', 'flexible', 'Wake Forest', ['Help with the move'], 12.6, ['helping hands'], 9],
  ['School-day essentials for a new chapter', 'goods', 'New backpacks, notebooks, and everyday school supplies for two children. The caseworker has a simple shopping list ready.', 'flexible', 'Garner', ['Shop the supply list', 'Donate a backpack'], 10.3, ['goods'], 6],
  ['Help keep the lights on', 'funds', 'Contribute toward a verified utility need for a kinship family. The organization coordinates payment directly with the provider.', 'critical', 'East Raleigh', ['Pledge a contribution'], 6.8, ['funds'], 1],
] as const;
export const demoNeeds: Need[] = rows.map((n, i) => ({ id: `demo-${i}`, title: n[0], category: n[1], description: n[2], urgency: n[3], service_area: ['Centre', 'Centre', 'Blair', 'Huntingdon', 'Clinton', 'Centre'][i], ways_to_help: [...n[5]], distance: n[6], capability_tags: [...n[7]], needed_by: day(n[8]), status: 'open', approved_at: day(-1), created_at: day(-i - 1), window_start: null, window_end: null }));
