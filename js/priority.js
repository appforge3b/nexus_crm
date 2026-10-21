import { ACTIVE_STAGES } from './stages.js';

function calendarDaysUntil(dateValue, now) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateValue ?? ''));
  if (!match) return null;
  const close = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((close - today) / 86400000);
}

export function urgencyFor(score) {
  if (score >= 60) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

export function valueBand(deal, deals) {
  if (!deals?.length) return 'none';
  const sorted = [...deals].sort((a, b) => b.value - a.value);
  const cutoff5 = Math.max(1, Math.ceil(deals.length * 0.05));
  const cutoff20 = Math.max(1, Math.ceil(deals.length * 0.2));
  if (deal.value >= sorted[cutoff5 - 1].value) return 'top5';
  if (deal.value >= sorted[cutoff20 - 1].value) return 'top20';
  return 'none';
}

export function scoreDeal(deal, { now, deals, activities }) {
  const reasons = [];
  const daysUntil = calendarDaysUntil(deal.expectedCloseDate, now);
  if (daysUntil === 0) reasons.push({ points: 40, text: 'Closing today!' });
  else if (daysUntil === 1) reasons.push({ points: 30, text: 'Closing tomorrow' });
  else if (daysUntil > 1 && daysUntil <= 3) reasons.push({ points: 30, text: `Closing in ${daysUntil} days` });
  else if (daysUntil > 3 && daysUntil <= 7) reasons.push({ points: 20, text: 'Closing this week' });
  else if (daysUntil != null && daysUntil < 0) reasons.push({ points: 35, text: `Close date passed ${Math.abs(daysUntil)} days ago` });

  const mine = (activities ?? []).filter((activity) => activity.contactId === deal.contactId);
  if (!mine.length) reasons.push({ points: 30, text: 'Going cold — no contact yet' });
  else {
    const last = Math.max(...mine.map((activity) => new Date(activity.date).getTime()));
    const silent = (now.getTime() - last) / 86400000;
    if (silent >= 14) reasons.push({ points: 30, text: `Going cold — ${Math.floor(silent)} days silent` });
    else if (silent >= 7) reasons.push({ points: 20, text: `No contact for ${Math.floor(silent)} days` });
  }

  const stalled = deal.stageChangedAt ? (now.getTime() - new Date(deal.stageChangedAt).getTime()) / 86400000 : 0;
  if (stalled > 30) reasons.push({ points: 20, text: `Stalled — ${Math.floor(stalled)} days in ${deal.stage}` });
  else if (stalled > 14) reasons.push({ points: 10, text: `Stalling — ${Math.floor(stalled)} days in ${deal.stage}` });

  const band = valueBand(deal, deals ?? []);
  if (band === 'top5') reasons.push({ points: 25, text: 'Top value deal' });
  else if (band === 'top20') reasons.push({ points: 15, text: 'High value deal' });

  if (deal.stage === 'closing') reasons.push({ points: 10, text: 'In closing stage' });
  else if (deal.stage === 'negotiation') reasons.push({ points: 5, text: 'In negotiation' });

  if (deal.priority === 'critical') reasons.push({ points: 20, text: 'Marked critical' });
  else if (deal.priority === 'high') reasons.push({ points: 10, text: 'Marked high priority' });

  reasons.sort((a, b) => b.points - a.points);
  const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
  return { score, urgency: urgencyFor(score), reasons: reasons.map((reason) => reason.text) };
}

export function listPriorities({ deals, activities, contacts, now, limit = 8 }) {
  return (deals ?? [])
    .filter((deal) => ACTIVE_STAGES.includes(deal.stage))
    .map((deal) => {
      const scored = scoreDeal(deal, { now, deals, activities });
      return {
        deal,
        contact: (contacts ?? []).find((contact) => contact.id === deal.contactId) ?? null,
        score: scored.score,
        urgency: scored.urgency,
        reasons: scored.reasons,
        primaryReason: scored.reasons[0] ?? '',
      };
    })
    .sort((a, b) => b.score - a.score || b.deal.value - a.deal.value || a.deal.title.localeCompare(b.deal.title))
    .slice(0, limit);
}
