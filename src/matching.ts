import type { Need, Profile } from './types';
export function rankDemo(needs: Need[], profile: Profile): Need[] {
  return needs.map(need => {
    const reasons: string[] = [];
    let score = 0;
    if (need.distance !== undefined) { score += Math.max(0, 30 * (1 - need.distance / 30)); reasons.push(`${need.distance.toFixed(1)} miles away`); }
    if (profile.capability_tags.includes(need.category)) { score += 35; reasons.unshift('Fits how you like to help'); }
    if (need.window_start && need.window_end && profile.availability.some(w => w.start <= need.window_start! && w.end >= need.window_end!)) { score += 20; reasons.push('Fits your availability'); }
    score += Math.max(0, 5 - (Date.now() - Date.parse(need.created_at)) / 86400000);
    return { ...need, score, reasons };
  }).sort((a, b) => b.score! - a.score!);
}
