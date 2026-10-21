import { formatMoneyCompact } from './format.js';
import { ACTIVE_STAGES } from './stages.js';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function inMonth(iso, year, monthIndex) {
  if (!iso) return false;
  const date = new Date(iso);
  return date.getFullYear() === year && date.getMonth() === monthIndex;
}

export function percentChange(current, previous) {
  if (previous === 0 && current === 0) return { direction: 'flat', label: '0%' };
  if (previous === 0) return { direction: 'up', label: 'New' };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct > 0) return { direction: 'up', label: `${pct}%` };
  if (pct < 0) return { direction: 'down', label: `${Math.abs(pct)}%` };
  return { direction: 'flat', label: '0%' };
}

export function pointChange(current, previous) {
  if (current == null || previous == null) return { direction: 'flat', label: '—' };
  const delta = Math.round(current - previous);
  if (delta > 0) return { direction: 'up', label: `${delta}pp` };
  if (delta < 0) return { direction: 'down', label: `${Math.abs(delta)}pp` };
  return { direction: 'flat', label: '0pp' };
}

function monthRate(deals, year, monthIndex) {
  const won = deals.filter((deal) => deal.stage === 'won' && inMonth(deal.stageChangedAt, year, monthIndex));
  const lost = deals.filter((deal) => deal.stage === 'lost' && inMonth(deal.stageChangedAt, year, monthIndex));
  const closed = won.length + lost.length;
  return closed ? (won.length / closed) * 100 : null;
}

function createdValue(deals, year, monthIndex) {
  return deals
    .filter((deal) => inMonth(deal.createdAt, year, monthIndex))
    .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
}

function wonValue(deals, year, monthIndex) {
  return deals
    .filter((deal) => deal.stage === 'won' && inMonth(deal.stageChangedAt, year, monthIndex))
    .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
}

export function buildKpis(deals, now, currency = '₹') {
  const active = deals.filter((deal) => ACTIVE_STAGES.includes(deal.stage));
  const year = now.getFullYear();
  const month = now.getMonth();
  const prev = new Date(year, month - 1, 1);
  const pipelineValue = active.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const won = deals.filter((deal) => deal.stage === 'won' && inMonth(deal.stageChangedAt, year, month));
  const rate = monthRate(deals, year, month);
  const previousRate = monthRate(deals, prev.getFullYear(), prev.getMonth());
  return {
    pipeline: {
      value: pipelineValue,
      count: active.length,
      formattedValue: formatMoneyCompact(pipelineValue, currency),
      trend: percentChange(createdValue(deals, year, month), createdValue(deals, prev.getFullYear(), prev.getMonth())),
    },
    won: {
      value: won.reduce((sum, deal) => sum + Number(deal.value || 0), 0),
      count: won.length,
      formattedValue: formatMoneyCompact(won.reduce((sum, deal) => sum + Number(deal.value || 0), 0), currency),
      trend: percentChange(wonValue(deals, year, month), wonValue(deals, prev.getFullYear(), prev.getMonth())),
    },
    conversion: {
      rate,
      formattedRate: rate == null ? '—' : `${Math.round(rate)}%`,
      trend: pointChange(rate, previousRate),
    },
  };
}

export function closingSummary(deals, now, currency = '₹') {
  const hot = deals.filter((deal) => {
    if (!ACTIVE_STAGES.includes(deal.stage) || !deal.expectedCloseDate) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deal.expectedCloseDate);
    if (!match) return false;
    const close = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((close - today) / 86400000);
    return days >= 0 && days <= 7;
  });
  if (!hot.length) return 'You have no deals closing this week.';
  const value = hot.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const noun = hot.length === 1 ? 'hot deal' : 'hot deals';
  return `You have ${hot.length} ${noun} worth ${formatMoneyCompact(value, currency)} closing this week.`;
}

export function forecastSeries(deals, now) {
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const currentKey = monthKey(now);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: 10 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const key = monthKey(date);
    const forecast = key >= currentKey;
    let value = 0;
    if (!forecast) {
      value = deals
        .filter((deal) => deal.stage === 'won' && monthKey(new Date(deal.stageChangedAt)) === key)
        .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    } else {
      value = deals
        .filter((deal) => deal.stage === 'won' && monthKey(new Date(deal.stageChangedAt)) === key)
        .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
      value += deals
        .filter((deal) => {
          if (!ACTIVE_STAGES.includes(deal.stage) || !deal.expectedCloseDate) return false;
          const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deal.expectedCloseDate);
          if (!match) return false;
          const keyMatch = `${match[1]}-${match[2]}` === key;
          const close = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
          return keyMatch && close >= today;
        })
        .reduce((sum, deal) => sum + (Number(deal.value || 0) * Number(deal.probability || 0)) / 100, 0);
    }
    return { key, value, forecast };
  });
}

export function presetRange(preset, now) {
  if (preset === 'all-time') return { start: null, end: null };
  if (preset === 'this-month') return { start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), end: now };
  if (preset === 'this-year') return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end: now };
  const months = preset === 'last-3-months' ? 3 : 6;
  const shifted = new Date(now);
  shifted.setMonth(shifted.getMonth() - months);
  shifted.setHours(0, 0, 0, 0);
  return { start: shifted, end: now };
}

export function averageStageDays(deals, stage, now) {
  const rows = deals.filter((deal) => deal.stage === stage);
  if (!rows.length) return 0;
  const total = rows.reduce((sum, deal) => sum + (now.getTime() - new Date(deal.stageChangedAt).getTime()) / 86400000, 0);
  return total / rows.length;
}

function inRange(iso, range) {
  if (!range || (range.start == null && range.end == null)) return true;
  const time = new Date(iso).getTime();
  if (range.start && time < range.start.getTime()) return false;
  if (range.end && time > range.end.getTime()) return false;
  return true;
}

export function wonByDay(deals, range) {
  const buckets = new Map();
  for (const deal of deals) {
    if (deal.stage !== 'won' || !inRange(deal.stageChangedAt, range)) continue;
    const date = new Date(deal.stageChangedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + Number(deal.value || 0));
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export { inRange };
