import { doneOnly } from './agenda.js';

function recencyPoints(days) {
  if (days <= 1) return 30;
  if (days <= 3) return 25;
  if (days <= 7) return 20;
  if (days <= 14) return 10;
  if (days <= 30) return 5;
  return 0;
}

function depthPoints(count) {
  if (count >= 20) return 20;
  if (count >= 10) return 15;
  if (count >= 5) return 10;
  if (count >= 2) return 5;
  return 0;
}

export function relationshipStrength(contact, { activities = [], deals = [], customers = [], now }) {
  const mine = doneOnly(activities).filter((activity) => activity.contactId === contact.id && new Date(activity.date) <= now);
  let recency = 0;
  if (mine.length) {
    const last = Math.max(...mine.map((activity) => new Date(activity.date).getTime()));
    recency = recencyPoints((now.getTime() - last) / 86400000);
  }
  const frequency = Math.min(mine.filter((activity) => (now.getTime() - new Date(activity.date).getTime()) / 86400000 <= 30).length * 5, 30);
  const depth = depthPoints(mine.length);
  let conversion = 0;
  if (deals.some((deal) => deal.contactId === contact.id && deal.stage === 'won')) conversion += 15;
  if (contact.status === 'customer' || customers.some((customer) => customer.contactId === contact.id)) conversion += 5;
  return {
    score: Math.min(100, recency + frequency + depth + conversion),
    recency,
    frequency,
    depth,
    conversion,
  };
}
