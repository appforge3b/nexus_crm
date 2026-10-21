import { describe, expect, it } from 'vitest';
import { relationshipStrength } from '../../js/relationship.js';
import { at, daysBefore } from '../helpers/time.js';

const NOW = at(2026, 10, 21, 12);
const contact = { id: 'c1', name: 'Ravi', status: 'prospect' };

function activity(daysAgo, extra = {}) {
  return {
    id: `a-${daysAgo}-${extra.id ?? ''}`,
    contactId: 'c1',
    date: daysBefore(NOW, daysAgo).toISOString(),
    ...extra,
  };
}

function strength(overrides) {
  return relationshipStrength(contact, {
    now: NOW,
    activities: [],
    deals: [],
    customers: [],
    ...overrides,
  });
}

describe('relationship strength', () => {
  it('is zero when the contact has no history', () => {
    expect(strength()).toEqual({ score: 0, recency: 0, frequency: 0, depth: 0, conversion: 0 });
  });

  it('scores recency on the most recent activity', () => {
    expect(strength({ activities: [activity(1), activity(20)] }).recency).toBe(30);
    expect(strength({ activities: [activity(1.01)] }).recency).toBe(25);
    expect(strength({ activities: [activity(3)] }).recency).toBe(25);
    expect(strength({ activities: [activity(3.01)] }).recency).toBe(20);
    expect(strength({ activities: [activity(7)] }).recency).toBe(20);
    expect(strength({ activities: [activity(7.01)] }).recency).toBe(10);
    expect(strength({ activities: [activity(14)] }).recency).toBe(10);
    expect(strength({ activities: [activity(14.01)] }).recency).toBe(5);
    expect(strength({ activities: [activity(30)] }).recency).toBe(5);
    expect(strength({ activities: [activity(30.01)] }).recency).toBe(0);
  });

  it('caps frequency at 30 and ignores other contacts', () => {
    expect(strength({ activities: [activity(1)] }).frequency).toBe(5);
    expect(strength({ activities: Array.from({ length: 6 }, (_, i) => activity(1, { id: i })) }).frequency).toBe(30);
    expect(strength({ activities: Array.from({ length: 8 }, (_, i) => activity(1, { id: i })) }).frequency).toBe(30);
    expect(strength({ activities: [activity(31)] }).frequency).toBe(0);
    expect(strength({ activities: [activity(1, { contactId: 'other' })] }).frequency).toBe(0);
  });

  it('scores depth from the lifetime activity count', () => {
    const depthFor = (count) => strength({
      activities: Array.from({ length: count }, (_, i) => activity(40, { id: i })),
    }).depth;
    expect(depthFor(1)).toBe(0);
    expect(depthFor(2)).toBe(5);
    expect(depthFor(5)).toBe(10);
    expect(depthFor(10)).toBe(15);
    expect(depthFor(20)).toBe(20);
  });

  it('adds conversion points for a won deal and for being a customer, then caps at 100', () => {
    const won = strength({ deals: [{ contactId: 'c1', stage: 'won' }] });
    expect(won.conversion).toBe(15);

    const customer = strength({
      customers: [{ contactId: 'c1' }],
      deals: [{ contactId: 'c1', stage: 'won' }],
    });
    expect(customer.conversion).toBe(20);

    const byStatus = relationshipStrength(
      { ...contact, status: 'customer' },
      { now: NOW, activities: [], deals: [], customers: [] },
    );
    expect(byStatus.conversion).toBe(5);

    const saturated = strength({
      activities: Array.from({ length: 20 }, (_, i) => activity(0.5, { id: i })),
      deals: [{ contactId: 'c1', stage: 'won' }],
      customers: [{ contactId: 'c1' }],
    });
    expect(saturated.recency + saturated.frequency + saturated.depth + saturated.conversion).toBe(100);
    expect(saturated.score).toBe(100);
  });
});
