import { ACTIVE_STAGES } from './stages.js';
import { forecastSeries, inRange } from './metrics.js';

const FUNNEL = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function barScale(values, width) {
  const max = Math.max(...values, 0);
  if (!max) return values.map(() => 0);
  return values.map((value) => (value / max) * width);
}

export function normalizeArea(values) {
  const max = Math.max(...values, 0);
  if (!max) return values.map(() => 0);
  return values.map((value) => value / max);
}

export function donutAngles(wonCount, lostCount) {
  const total = wonCount + lostCount;
  if (!total) return { won: 0, lost: 0 };
  return { won: (wonCount / total) * 360, lost: (lostCount / total) * 360 };
}

export function funnelModel(deals) {
  const open = (deals ?? []).filter((deal) => deal.stage !== 'lost');
  const base = open.length;
  return FUNNEL.map((stage, index) => {
    const reached = open.filter((deal) => FUNNEL.indexOf(deal.stage) >= index);
    return {
      stage,
      count: reached.length,
      value: reached.reduce((sum, deal) => sum + Number(deal.value || 0), 0),
      percent: base ? Math.round((reached.length / base) * 100) : 0,
    };
  });
}

export function winLossModel(deals, range) {
  const won = (deals ?? []).filter((deal) => deal.stage === 'won' && inRange(deal.stageChangedAt, range));
  const lost = (deals ?? []).filter((deal) => deal.stage === 'lost' && inRange(deal.stageChangedAt, range));
  const total = won.length + lost.length;
  return {
    wonCount: won.length,
    lostCount: lost.length,
    wonValue: won.reduce((sum, deal) => sum + Number(deal.value || 0), 0),
    lostValue: lost.reduce((sum, deal) => sum + Number(deal.value || 0), 0),
    winRate: total ? Math.round((won.length / total) * 100) : 0,
  };
}

export function lostReasons(deals, range) {
  const counts = new Map();
  for (const deal of deals ?? []) {
    if (deal.stage !== 'lost' || !inRange(deal.stageChangedAt, range)) continue;
    const reason = String(deal.lostReason || 'Other').trim() || 'Other';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/** Months of won revenue, then probability-weighted forecast with a confidence band. */
export function forecastModel(deals, now) {
  const series = forecastSeries(deals, now);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return series.map((point) => {
    const [year, month] = point.key.split('-').map(Number);
    const value = point.value;
    if (!point.forecast) {
      return { key: point.key, label: SHORT_MONTHS[month - 1], title: `${SHORT_MONTHS[month - 1]} ${year}`, value, forecast: false, low: value, high: value };
    }
    const open = (deals ?? []).filter((deal) => {
      if (!ACTIVE_STAGES.includes(deal.stage) || !deal.expectedCloseDate) return false;
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deal.expectedCloseDate);
      if (!match || `${match[1]}-${match[2]}` !== point.key) return false;
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) >= today;
    });
    const potential = open.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const weighted = open.reduce((sum, deal) => sum + (Number(deal.value || 0) * Number(deal.probability || 0)) / 100, 0);
    const booked = value - weighted;
    return {
      key: point.key,
      label: SHORT_MONTHS[month - 1],
      title: `${SHORT_MONTHS[month - 1]} ${year}`,
      value,
      forecast: true,
      low: booked + weighted * 0.6,
      high: value + (potential - weighted) * 0.4,
    };
  });
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** GitHub-style grid of the last six months, Sunday-first columns. */
export function heatmapModel(deals, now, range) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getFullYear(), end.getMonth() - 6, end.getDate());
  start.setDate(start.getDate() - start.getDay());
  const totals = new Map();
  for (const deal of deals ?? []) {
    if (deal.stage !== 'won' || !deal.stageChangedAt) continue;
    const key = dayKey(new Date(deal.stageChangedAt));
    totals.set(key, (totals.get(key) ?? 0) + Number(deal.value || 0));
  }
  const days = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    const noon = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 12).toISOString();
    days.push({ date: key, value: totals.get(key) ?? 0, inRange: inRange(noon, range) });
  }
  return { start: dayKey(start), days, max: Math.max(0, ...days.map((day) => day.value)) };
}

/** Average days spent per active stage, from stage history when available. */
export function velocityModel(deals, now, range) {
  const sums = new Map(ACTIVE_STAGES.map((stage) => [stage, { total: 0, count: 0 }]));
  for (const deal of deals ?? []) {
    if (!inRange(deal.stageChangedAt || deal.createdAt, range)) continue;
    const history = Array.isArray(deal.stageHistory) && deal.stageHistory.length
      ? deal.stageHistory
      : [{ stage: deal.stage, at: deal.stageChangedAt || deal.createdAt }];
    history.forEach((entry, index) => {
      const bucket = sums.get(entry.stage);
      if (!bucket) return;
      const from = new Date(entry.at).getTime();
      const next = history[index + 1];
      const to = next ? new Date(next.at).getTime() : now.getTime();
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return;
      bucket.total += (to - from) / DAY;
      bucket.count += 1;
    });
  }
  return ACTIVE_STAGES.map((stage) => {
    const { total, count } = sums.get(stage);
    return { stage, days: count ? total / count : 0, samples: count };
  });
}

export function sparklineValues(orders) {
  return (orders ?? [])
    .filter((order) => order.status !== 'cancelled')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((order) => Number(order.amount || 0));
}

export { ACTIVE_STAGES };
