import { describe, expect, it } from 'vitest';
import {
  averageStageDays,
  buildKpis,
  closingSummary,
  forecastSeries,
  percentChange,
  pointChange,
  presetRange,
  wonByDay,
} from '../../js/metrics.js';
import { funnelModel } from '../../js/charts.js';
import { at, daysBefore, isoDate } from '../helpers/time.js';

const NOW = at(2026, 10, 21, 15);

function deal(overrides) {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    contactId: 'c1',
    value: overrides.value,
    stage: overrides.stage,
    probability: overrides.probability ?? 10,
    expectedCloseDate: overrides.expectedCloseDate ?? '',
    stageChangedAt: overrides.stageChangedAt,
    createdAt: overrides.createdAt,
    priority: 'medium',
    notes: '',
    lostReason: overrides.stage === 'lost' ? 'Price' : '',
    updatedAt: overrides.stageChangedAt,
  };
}

describe('KPI math', () => {
  const deals = [
    deal({ id: 'a', value: 400, stage: 'prospect', createdAt: at(2026, 10, 5).toISOString(), stageChangedAt: at(2026, 10, 5).toISOString() }),
    deal({ id: 'b', value: 200, stage: 'qualified', createdAt: at(2026, 9, 5).toISOString(), stageChangedAt: at(2026, 9, 5).toISOString() }),
    deal({ id: 'c', value: 100, stage: 'won', createdAt: at(2026, 10, 10).toISOString(), stageChangedAt: at(2026, 10, 10).toISOString(), probability: 100 }),
    deal({ id: 'd', value: 50, stage: 'won', createdAt: at(2026, 9, 15).toISOString(), stageChangedAt: at(2026, 9, 20).toISOString(), probability: 100 }),
    deal({ id: 'e', value: 100, stage: 'lost', createdAt: at(2026, 10, 8).toISOString(), stageChangedAt: at(2026, 10, 8).toISOString(), probability: 0 }),
    deal({ id: 'f', value: 50, stage: 'lost', createdAt: at(2026, 9, 8).toISOString(), stageChangedAt: at(2026, 9, 18).toISOString(), probability: 0 }),
  ];

  it('sums the live pipeline and compares rupees created this month with last month', () => {
    const kpis = buildKpis(deals, NOW);
    expect(kpis.pipeline).toMatchObject({ value: 600, count: 2, formattedValue: '₹600' });
    expect(kpis.pipeline.trend).toEqual({ direction: 'up', label: '100%' });
    expect(kpis.won).toMatchObject({ value: 100, count: 1, formattedValue: '₹100' });
    expect(kpis.won.trend).toEqual({ direction: 'up', label: '100%' });
    expect(kpis.conversion).toMatchObject({ rate: 50, formattedRate: '50%' });
    expect(kpis.conversion.trend).toEqual({ direction: 'flat', label: '0pp' });
  });

  it('expresses percent and percentage-point movement', () => {
    expect(percentChange(124, 100)).toEqual({ direction: 'up', label: '24%' });
    expect(percentChange(80, 100)).toEqual({ direction: 'down', label: '20%' });
    expect(percentChange(0, 0)).toEqual({ direction: 'flat', label: '0%' });
    expect(percentChange(10, 0)).toEqual({ direction: 'up', label: 'New' });
    expect(pointChange(40, 37)).toEqual({ direction: 'up', label: '3pp' });
    expect(pointChange(20, 25)).toEqual({ direction: 'down', label: '5pp' });
    expect(pointChange(null, 10)).toEqual({ direction: 'flat', label: '—' });
  });

  it('returns a null conversion rate when nothing closed, and formats it as an em dash', () => {
    const kpis = buildKpis([
      deal({ id: 'open', value: 10, stage: 'proposal', createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
    ], NOW);
    expect(kpis.conversion.rate).toBeNull();
    expect(kpis.conversion.formattedRate).toBe('—');
  });
});

describe('briefing summary and forecast', () => {
  it('sums active deals whose close date falls inside the next seven days', () => {
    const deals = [
      deal({ id: 'hot', value: 1240000, stage: 'closing', expectedCloseDate: isoDate(2026, 10, 23), createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
      deal({ id: 'later', value: 5000000, stage: 'proposal', expectedCloseDate: isoDate(2026, 11, 15), createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
      deal({ id: 'won', value: 900000, stage: 'won', expectedCloseDate: isoDate(2026, 10, 22), createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
    ];
    expect(closingSummary(deals, NOW)).toBe('You have 1 hot deal worth ₹12.4L closing this week.');
    expect(closingSummary([
      deals[0],
      deal({ id: 'hot2', value: 100000, stage: 'qualified', expectedCloseDate: isoDate(2026, 10, 21), createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
    ], NOW)).toBe('You have 2 hot deals worth ₹13.4L closing this week.');
    expect(closingSummary([], NOW)).toBe('You have no deals closing this week.');
  });

  it('plots six actual months, then weights the current month and the next three', () => {
    const deals = [
      deal({ id: 'apr', value: 200, stage: 'won', probability: 100, stageChangedAt: at(2026, 4, 10).toISOString(), createdAt: at(2026, 4, 1).toISOString(), expectedCloseDate: isoDate(2026, 11, 1) }),
      deal({ id: 'oct-won', value: 200, stage: 'won', probability: 100, stageChangedAt: at(2026, 10, 4).toISOString(), createdAt: at(2026, 9, 1).toISOString(), expectedCloseDate: isoDate(2026, 10, 4) }),
      deal({ id: 'oct-open', value: 100, stage: 'proposal', probability: 50, stageChangedAt: NOW.toISOString(), createdAt: NOW.toISOString(), expectedCloseDate: isoDate(2026, 10, 28) }),
      deal({ id: 'nov', value: 100, stage: 'negotiation', probability: 65, stageChangedAt: NOW.toISOString(), createdAt: NOW.toISOString(), expectedCloseDate: isoDate(2026, 11, 12) }),
      deal({ id: 'overdue', value: 999, stage: 'closing', probability: 85, stageChangedAt: NOW.toISOString(), createdAt: NOW.toISOString(), expectedCloseDate: isoDate(2026, 10, 1) }),
      deal({ id: 'lost', value: 999, stage: 'lost', probability: 0, stageChangedAt: at(2026, 10, 2).toISOString(), createdAt: NOW.toISOString(), expectedCloseDate: isoDate(2026, 10, 2) }),
    ];
    const series = forecastSeries(deals, NOW);
    expect(series.map((point) => point.key)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      '2026-10', '2026-11', '2026-12', '2027-01',
    ]);
    expect(series.find((point) => point.key === '2026-04')).toMatchObject({ value: 200, forecast: false });
    expect(series.find((point) => point.key === '2026-05').value).toBe(0);
    expect(series.find((point) => point.key === '2026-10')).toMatchObject({ value: 250, forecast: true });
    expect(series.find((point) => point.key === '2026-11')).toMatchObject({ value: 65, forecast: true });
    expect(series.every((point) => point.key < '2026-10' ? point.forecast === false : point.forecast === true)).toBe(true);
  });
});

describe('radar aggregations', () => {
  it('resolves the date presets from the local clock', () => {
    expect(presetRange('this-month', NOW)).toEqual({ start: at(2026, 10, 1, 0, 0, 0), end: NOW });
    expect(presetRange('last-3-months', NOW).start).toEqual(at(2026, 7, 21, 0, 0, 0));
    expect(presetRange('last-6-months', NOW).start).toEqual(at(2026, 4, 21, 0, 0, 0));
    expect(presetRange('this-year', NOW).start).toEqual(at(2026, 1, 1, 0, 0, 0));
    expect(presetRange('all-time', NOW)).toEqual({ start: null, end: null });
    expect(presetRange('last-3-months', NOW).end).toEqual(NOW);
  });

  it('builds a cumulative funnel with counts and values that ignores lost deals', () => {
    const deals = [
      ['p1', 'prospect'], ['p2', 'prospect'],
      ['q1', 'qualified'], ['q2', 'qualified'],
      ['n1', 'negotiation'],
      ['w1', 'won'],
      ['l1', 'lost'], ['l2', 'lost'], ['l3', 'lost'],
    ].map(([id, stage]) => deal({
      id,
      stage,
      value: 1,
      createdAt: NOW.toISOString(),
      stageChangedAt: NOW.toISOString(),
    }));
    expect(funnelModel(deals)).toEqual([
      { stage: 'prospect', count: 6, value: 6, percent: 100 },
      { stage: 'qualified', count: 4, value: 4, percent: 67 },
      { stage: 'proposal', count: 2, value: 2, percent: 33 },
      { stage: 'negotiation', count: 2, value: 2, percent: 33 },
      { stage: 'closing', count: 1, value: 1, percent: 17 },
      { stage: 'won', count: 1, value: 1, percent: 17 },
    ]);
    expect(funnelModel([])).toEqual([
      { stage: 'prospect', count: 0, value: 0, percent: 0 },
      { stage: 'qualified', count: 0, value: 0, percent: 0 },
      { stage: 'proposal', count: 0, value: 0, percent: 0 },
      { stage: 'negotiation', count: 0, value: 0, percent: 0 },
      { stage: 'closing', count: 0, value: 0, percent: 0 },
      { stage: 'won', count: 0, value: 0, percent: 0 },
    ]);
  });

  it('averages current dwell time per stage', () => {
    const deals = [
      deal({ id: 'a', stage: 'prospect', value: 1, createdAt: daysBefore(NOW, 10).toISOString(), stageChangedAt: daysBefore(NOW, 2).toISOString() }),
      deal({ id: 'b', stage: 'prospect', value: 1, createdAt: daysBefore(NOW, 10).toISOString(), stageChangedAt: daysBefore(NOW, 4).toISOString() }),
    ];
    expect(averageStageDays(deals, 'prospect', NOW)).toBe(3);
    expect(averageStageDays(deals, 'proposal', NOW)).toBe(0);
  });

  it('buckets won value by the local day the deal was marked won', () => {
    const range = { start: at(2026, 4, 1, 0, 0, 0), end: NOW };
    const rows = wonByDay([
      deal({ id: 'in', stage: 'won', value: 10, createdAt: at(2026, 4, 1).toISOString(), stageChangedAt: at(2026, 4, 2, 18).toISOString() }),
      deal({ id: 'same', stage: 'won', value: 5, createdAt: at(2026, 4, 1).toISOString(), stageChangedAt: at(2026, 4, 2, 8).toISOString() }),
      deal({ id: 'old', stage: 'won', value: 99, createdAt: at(2026, 3, 1).toISOString(), stageChangedAt: at(2026, 3, 31, 12).toISOString() }),
      deal({ id: 'open', stage: 'closing', value: 99, createdAt: NOW.toISOString(), stageChangedAt: NOW.toISOString() }),
    ], range);
    expect(rows).toEqual([{ date: '2026-04-02', value: 15 }]);
  });
});
