import { describe, expect, it } from 'vitest';
import { forecastModel, heatmapModel, lostReasons, velocityModel } from '../../js/charts.js';
import { moveDeal } from '../../js/deals.js';
import { contactLifetime } from '../../js/customers.js';
import { presetRange } from '../../js/metrics.js';
import { Store } from '../../js/store.js';
import { at, isoDate, memoryStorage } from '../helpers/time.js';

const NOW = at(2026, 10, 21, 9);
const ALL = presetRange('all-time', NOW);

function deal(overrides) {
  return {
    id: 'd', title: 'Deal', contactId: 'c', value: 100000, stage: 'prospect', priority: 'medium',
    probability: 10, expectedCloseDate: '', notes: '', lostReason: '',
    createdAt: at(2026, 9, 1).toISOString(), stageChangedAt: at(2026, 9, 1).toISOString(),
    ...overrides,
  };
}

describe('revenue forecast model', () => {
  it('reports actual months flat and future months with a weighted confidence band', () => {
    const deals = [
      deal({ id: 'w', stage: 'won', value: 300000, stageChangedAt: at(2026, 9, 10).toISOString() }),
      deal({ id: 'o', stage: 'closing', value: 1000000, probability: 50, expectedCloseDate: isoDate(2026, 11, 15) }),
    ];
    const points = forecastModel(deals, NOW);
    const september = points.find((point) => point.key === '2026-09');
    expect(september).toMatchObject({ value: 300000, forecast: false, low: 300000, high: 300000 });

    const november = points.find((point) => point.key === '2026-11');
    expect(november.forecast).toBe(true);
    expect(november.value).toBe(500000);
    expect(november.low).toBeLessThan(november.value);
    expect(november.high).toBeGreaterThan(november.value);
  });
});

describe('revenue heatmap model', () => {
  it('covers six months in whole Sunday-first weeks and totals won value per day', () => {
    const won = at(2026, 10, 5, 15);
    const model = heatmapModel([
      deal({ id: 'a', stage: 'won', value: 200000, stageChangedAt: won.toISOString() }),
      deal({ id: 'b', stage: 'won', value: 50000, stageChangedAt: at(2026, 10, 5, 10).toISOString() }),
      deal({ id: 'c', stage: 'lost', value: 999999, stageChangedAt: won.toISOString() }),
    ], NOW, ALL);
    expect(new Date(`${model.start}T12:00:00`).getDay()).toBe(0);
    expect(model.days.at(-1).date).toBe(isoDate(2026, 10, 21));
    expect(model.days.length).toBeGreaterThan(26 * 7 - 7);
    expect(model.days.find((day) => day.date === isoDate(2026, 10, 5)).value).toBe(250000);
    expect(model.max).toBe(250000);
  });
});

describe('pipeline velocity model', () => {
  it('averages days per stage from each deal\'s stage history', () => {
    const deals = [
      deal({
        id: 'a', stage: 'proposal', stageChangedAt: at(2026, 10, 11).toISOString(),
        stageHistory: [
          { stage: 'prospect', at: at(2026, 10, 1).toISOString() },
          { stage: 'qualified', at: at(2026, 10, 5).toISOString() },
          { stage: 'proposal', at: at(2026, 10, 11).toISOString() },
        ],
      }),
      deal({
        id: 'b', stage: 'qualified', stageChangedAt: at(2026, 10, 15).toISOString(),
        stageHistory: [
          { stage: 'prospect', at: at(2026, 10, 9).toISOString() },
          { stage: 'qualified', at: at(2026, 10, 15).toISOString() },
        ],
      }),
    ];
    const rows = Object.fromEntries(velocityModel(deals, at(2026, 10, 21), ALL).map((row) => [row.stage, row]));
    expect(rows.prospect.days).toBeCloseTo(5, 5);
    expect(rows.prospect.samples).toBe(2);
    expect(rows.qualified.days).toBeCloseTo(6, 5);
    expect(rows.proposal.days).toBeCloseTo(10, 5);
    expect(rows.closing).toMatchObject({ days: 0, samples: 0 });
  });

  it('ranks lost reasons by frequency', () => {
    const deals = [
      deal({ id: 'a', stage: 'lost', lostReason: 'Price' }),
      deal({ id: 'b', stage: 'lost', lostReason: 'Competitor' }),
      deal({ id: 'c', stage: 'lost', lostReason: 'Price' }),
      deal({ id: 'd', stage: 'lost', lostReason: '' }),
    ];
    expect(lostReasons(deals, ALL)).toEqual([
      { reason: 'Price', count: 2 },
      { reason: 'Competitor', count: 1 },
      { reason: 'Other', count: 1 },
    ]);
  });
});

describe('stage history', () => {
  it('records every move so velocity can be measured later', () => {
    const store = new Store({ storage: memoryStorage(), clock: { now: () => NOW } });
    const created = store.create('deals', deal({ stage: 'prospect', stageChangedAt: at(2026, 10, 1).toISOString() }));
    moveDeal(store, created.id, 'qualified', { now: at(2026, 10, 4) });
    moveDeal(store, created.id, 'proposal', { now: at(2026, 10, 9) });
    expect(store.getById('deals', created.id).stageHistory).toEqual([
      { stage: 'prospect', at: at(2026, 10, 1).toISOString() },
      { stage: 'qualified', at: at(2026, 10, 4).toISOString() },
      { stage: 'proposal', at: at(2026, 10, 9).toISOString() },
    ]);
  });
});

describe('contact lifetime value', () => {
  it('uses order revenue for customers and won deals for everyone else', () => {
    const deals = [
      deal({ id: 'a', contactId: 'c1', stage: 'won', value: 300000 }),
      deal({ id: 'b', contactId: 'c1', stage: 'closing', value: 900000 }),
      deal({ id: 'c', contactId: 'c2', stage: 'won', value: 777777 }),
    ];
    const customers = [{ id: 'k2', contactId: 'c2' }];
    const orders = [
      { id: 'o1', customerId: 'k2', amount: 100000, status: 'completed' },
      { id: 'o2', customerId: 'k2', amount: 50000, status: 'cancelled' },
    ];
    expect(contactLifetime({ id: 'c1' }, { deals, orders, customers })).toBe(300000);
    expect(contactLifetime({ id: 'c2' }, { deals, orders, customers })).toBe(100000);
  });
});
