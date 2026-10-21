import { describe, expect, it } from 'vitest';
import { listPriorities, scoreDeal, urgencyFor, valueBand } from '../../js/priority.js';
import { at, daysBefore, isoDate } from '../helpers/time.js';

/**
 * Close-date, silence, stall, and value bands are exclusive within themselves.
 * A deal closing in 2 days scores "within 3 days" only, not also "within 7 days".
 * Top 5% does not also collect the top-20% points. 14+ silent days replace 7+.
 * Stage and manual-priority points always add.
 * Only active stages appear in the daily list.
 */

const NOW = at(2026, 10, 21, 12);

function deal(overrides = {}) {
  return {
    id: overrides.id ?? 'd1',
    title: overrides.title ?? 'Deal',
    contactId: 'c1',
    value: 1000,
    stage: 'prospect',
    priority: 'low',
    probability: 10,
    expectedCloseDate: '',
    notes: '',
    lostReason: '',
    stageChangedAt: daysBefore(NOW, 1).toISOString(),
    createdAt: daysBefore(NOW, 2).toISOString(),
    updatedAt: daysBefore(NOW, 1).toISOString(),
    ...overrides,
  };
}

function activity(daysAgo, extra = {}) {
  return {
    id: extra.id ?? `a-${daysAgo}`,
    type: 'call',
    contactId: 'c1',
    dealId: 'd1',
    title: 'Call',
    description: '',
    date: daysBefore(NOW, daysAgo).toISOString(),
    duration: 15,
    outcome: '',
    createdAt: daysBefore(NOW, daysAgo).toISOString(),
    updatedAt: daysBefore(NOW, daysAgo).toISOString(),
    ...extra,
  };
}

const recent = [activity(1)];

function score(overrides, activities = recent, deals) {
  const subject = deal(overrides);
  const universe = deals ?? [
    subject,
    ...Array.from({ length: 9 }, (_, index) => deal({
      id: `filler-${index}`,
      value: 10000 + index,
      title: `Filler ${index}`,
      contactId: 'filler',
    })),
  ];
  const target = universe.find((item) => item.id === subject.id) ?? subject;
  return scoreDeal(target, { now: NOW, deals: universe, activities });
}

describe('urgency bands', () => {
  it('maps score thresholds to critical, high, medium, and low', () => {
    expect(urgencyFor(60)).toBe('critical');
    expect(urgencyFor(100)).toBe('critical');
    expect(urgencyFor(59)).toBe('high');
    expect(urgencyFor(40)).toBe('high');
    expect(urgencyFor(39)).toBe('medium');
    expect(urgencyFor(20)).toBe('medium');
    expect(urgencyFor(19)).toBe('low');
    expect(urgencyFor(0)).toBe('low');
  });
});

describe('priority scoring', () => {
  it('scores a quiet low-value deal as zero', () => {
    const result = score({ expectedCloseDate: isoDate(2026, 11, 20) });
    expect(result.score).toBe(0);
    expect(result.urgency).toBe('low');
    expect(result.reasons).toEqual([]);
  });

  it('treats close-date windows as a single exclusive band', () => {
    expect(score({ expectedCloseDate: isoDate(2026, 10, 21) }).reasons).toContain('Closing today!');
    expect(score({ expectedCloseDate: isoDate(2026, 10, 21) }).score).toBe(40);

    const tomorrow = score({ expectedCloseDate: isoDate(2026, 10, 22) });
    expect(tomorrow.reasons).toEqual(['Closing tomorrow']);
    expect(tomorrow.score).toBe(30);

    expect(score({ expectedCloseDate: isoDate(2026, 10, 24) }).reasons).toEqual(['Closing in 3 days']);
    expect(score({ expectedCloseDate: isoDate(2026, 10, 26) }).reasons).toEqual(['Closing this week']);
    expect(score({ expectedCloseDate: isoDate(2026, 10, 28) }).reasons).toEqual(['Closing this week']);
    expect(score({ expectedCloseDate: isoDate(2026, 10, 29) }).reasons).toEqual([]);

    const overdue = score({ expectedCloseDate: isoDate(2026, 10, 17) });
    expect(overdue.reasons).toEqual(['Close date passed 4 days ago']);
    expect(overdue.score).toBe(35);
  });

  it('scores silence from the latest activity on the contact, with 14 days replacing 7', () => {
    const week = score({}, [activity(7)]);
    expect(week.reasons).toEqual(['No contact for 7 days']);
    expect(week.score).toBe(20);

    const cold = score({}, [activity(14)]);
    expect(cold.reasons).toEqual(['Going cold — 14 days silent']);
    expect(cold.score).toBe(30);

    const none = score({}, []);
    expect(none.reasons).toEqual(['Going cold — no contact yet']);
    expect(none.score).toBe(30);

    const otherContact = score({}, [activity(20, { contactId: 'someone-else' })]);
    expect(otherContact.reasons).toContain('Going cold — no contact yet');
  });

  it('scores stall time from stageChangedAt, with 30 days replacing 14', () => {
    const stalling = score({ stageChangedAt: daysBefore(NOW, 20).toISOString() });
    expect(stalling.reasons).toEqual(['Stalling — 20 days in prospect']);
    expect(stalling.score).toBe(10);

    const stalled = score({ stage: 'negotiation', stageChangedAt: daysBefore(NOW, 40).toISOString() });
    expect(stalled.reasons).toEqual(['Stalled — 40 days in negotiation', 'In negotiation']);
    expect(stalled.score).toBe(25);

    expect(score({ stageChangedAt: daysBefore(NOW, 14).toISOString() }).score).toBe(0);
  });

  it('adds stage and manual priority points', () => {
    expect(score({ stage: 'closing' }).reasons).toEqual(['In closing stage']);
    expect(score({ stage: 'negotiation' }).score).toBe(5);
    expect(score({ priority: 'critical' }).reasons).toEqual(['Marked critical']);
    expect(score({ priority: 'critical' }).score).toBe(20);
    expect(score({ priority: 'high' }).score).toBe(10);
    expect(score({ priority: 'medium' }).score).toBe(0);
  });

  it('ranks value against every deal and keeps the stronger percentile only', () => {
    const deals = Array.from({ length: 20 }, (_, index) => deal({
      id: `d${index}`,
      value: 20 - index,
      title: `Deal ${index}`,
    }));
    expect(valueBand(deals[0], deals)).toBe('top5');
    expect(valueBand(deals[1], deals)).toBe('top20');
    expect(valueBand(deals[4], deals)).toBe('none');

    expect(score({ id: 'd0', value: 20 }, recent, deals).reasons).toContain('Top value deal');
    expect(score({ id: 'd0', value: 20 }, recent, deals).score).toBe(25);
    expect(score({ id: 'd1', value: 19 }, recent, deals).reasons).toEqual(['High value deal']);
    expect(score({ id: 'd1', value: 19 }, recent, deals).score).toBe(15);
  });

  it('lets tied values share the band of the cutoff rank', () => {
    const deals = [
      deal({ id: 'a', value: 100 }),
      deal({ id: 'b', value: 100 }),
      ...Array.from({ length: 8 }, (_, index) => deal({ id: `x${index}`, value: 1 })),
    ];
    expect(valueBand(deals[0], deals)).toBe('top5');
    expect(valueBand(deals[1], deals)).toBe('top5');
  });

  it('stacks independent reasons with the highest points first', () => {
    const result = score({
      expectedCloseDate: isoDate(2026, 10, 21),
      priority: 'critical',
      stage: 'closing',
    });
    expect(result.score).toBe(70);
    expect(result.urgency).toBe('critical');
    expect(result.reasons).toEqual(['Closing today!', 'Marked critical', 'In closing stage']);
  });
});

describe('daily priority list', () => {
  const contacts = [{ id: 'c1', name: 'Ravi Krishnan' }];

  it('keeps eight active deals and drops won, lost, and the lowest scores', () => {
    const deals = [
      deal({ id: 'won', stage: 'won', priority: 'critical', value: 999, title: 'Won' }),
      deal({ id: 'lost', stage: 'lost', priority: 'critical', value: 999, title: 'Lost' }),
      deal({ id: 'today', expectedCloseDate: isoDate(2026, 10, 21), value: 1, title: 'Today' }),
      ...Array.from({ length: 9 }, (_, index) => deal({
        id: `p${index}`,
        expectedCloseDate: isoDate(2026, 10, 17),
        value: index,
        title: `Passed ${index}`,
      })),
      ...Array.from({ length: 20 }, (_, index) => deal({
        id: `big-${index}`,
        stage: 'won',
        value: 100000,
        title: `Big ${index}`,
      })),
    ];
    const ranked = listPriorities({ deals, activities: recent, contacts, now: NOW });
    expect(ranked).toHaveLength(8);
    expect(ranked.map((item) => item.deal.id)).toEqual(expect.not.arrayContaining(['won', 'lost', 'p0', 'p1']));
    expect(ranked[0]).toMatchObject({
      score: 40,
      primaryReason: 'Closing today!',
      contact: { name: 'Ravi Krishnan' },
    });
    expect(ranked[0].primaryReason).toBe(ranked[0].reasons[0]);
    expect(ranked.map((item) => item.score)).toEqual([...ranked].sort((a, b) => b.score - a.score).map((item) => item.score));
  });

  it('breaks equal scores by value, then by title', () => {
    const deals = [
      deal({ id: 'low-a', priority: 'high', stage: 'closing', value: 100, title: 'Bravo' }),
      deal({ id: 'low-b', priority: 'high', stage: 'closing', value: 500, title: 'Zulu' }),
      deal({ id: 'low-c', priority: 'high', stage: 'closing', value: 100, title: 'Alpha' }),
      ...Array.from({ length: 7 }, (_, index) => deal({
        id: `filler-${index}`,
        stage: 'won',
        value: 10000,
        title: `Filler ${index}`,
        contactId: 'filler',
      })),
    ];
    const ranked = listPriorities({ deals, activities: recent, contacts, now: NOW });
    expect(ranked.filter((item) => item.deal.id.startsWith('low')).map((item) => item.deal.id)).toEqual(['low-b', 'low-c', 'low-a']);
  });
});
