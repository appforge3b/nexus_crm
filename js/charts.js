import { ACTIVE_STAGES } from './stages.js';
import { inRange } from './metrics.js';

const FUNNEL = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];

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
    const count = open.filter((deal) => FUNNEL.indexOf(deal.stage) >= index).length;
    return { stage, count, percent: base ? Math.round((count / base) * 100) : 0 };
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

export { ACTIVE_STAGES };
