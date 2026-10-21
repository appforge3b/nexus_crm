import { describe, expect, it } from 'vitest';
import { LOST_REASONS, STAGE_PROBABILITY, STAGES, confirmConversion, isBackwardMove, moveDeal, nextProbability } from '../../js/deals.js';
import { Store } from '../../js/store.js';
import { at, frozenClock, memoryStorage } from '../helpers/time.js';

describe('stage rules', () => {
  it('locks the default probabilities', () => {
    expect(STAGES).toEqual(['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won', 'lost']);
    expect(STAGE_PROBABILITY).toEqual({
      prospect: 10, qualified: 25, proposal: 50, negotiation: 65, closing: 85, won: 100, lost: 0,
    });
    expect(LOST_REASONS).toEqual(['Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Other']);
  });

  it('keeps a manual probability and refreshes an automatic one when the stage changes', () => {
    expect(nextProbability('prospect', 'qualified', 10)).toBe(25);
    expect(nextProbability('prospect', 'qualified', 40)).toBe(40);
    expect(nextProbability('negotiation', 'won', 65)).toBe(100);
    expect(nextProbability('closing', 'lost', 85)).toBe(0);
    expect(nextProbability('prospect', 'qualified', null)).toBe(25);
  });

  it('flags movement back down the open pipeline, and not a drop into lost', () => {
    expect(isBackwardMove('negotiation', 'qualified')).toBe(true);
    expect(isBackwardMove('won', 'closing')).toBe(true);
    expect(isBackwardMove('qualified', 'negotiation')).toBe(false);
    expect(isBackwardMove('closing', 'won')).toBe(false);
    expect(isBackwardMove('negotiation', 'lost')).toBe(false);
    expect(isBackwardMove('prospect', 'prospect')).toBe(false);
  });
});

function appStore() {
  const clock = frozenClock(at(2026, 10, 21, 12));
  const store = new Store({ storage: memoryStorage(), clock, seed: false });
  const contact = store.create('contacts', { name: 'Ravi Krishnan', status: 'prospect' });
  const deal = store.create('deals', {
    title: 'Expansion',
    contactId: contact.id,
    value: 250000,
    stage: 'negotiation',
    priority: 'high',
    probability: 65,
    expectedCloseDate: '2026-10-30',
    notes: '',
    lostReason: '',
    stageChangedAt: at(2026, 10, 1, 12).toISOString(),
  });
  return { store, clock, contact, deal };
}

describe('moveDeal', () => {
  it('refuses a backward move until it is confirmed', () => {
    const { store, deal } = appStore();
    const held = moveDeal(store, deal.id, 'qualified', { now: at(2026, 10, 21, 12) });
    expect(held).toMatchObject({ ok: false, needsConfirmation: true });
    expect(store.getById('deals', deal.id).stage).toBe('negotiation');

    const moved = moveDeal(store, deal.id, 'qualified', { now: at(2026, 10, 21, 12), confirm: true });
    expect(moved.ok).toBe(true);
    expect(store.getById('deals', deal.id)).toMatchObject({
      stage: 'qualified',
      probability: 25,
      stageChangedAt: at(2026, 10, 21, 12).toISOString(),
    });
  });

  it('requires a lost reason and then records it', () => {
    const { store, deal } = appStore();
    expect(moveDeal(store, deal.id, 'lost', { now: at(2026, 10, 21, 12) })).toMatchObject({
      ok: false,
      needsLostReason: true,
    });
    const moved = moveDeal(store, deal.id, 'lost', { now: at(2026, 10, 21, 12), lostReason: 'Price' });
    expect(store.getById('deals', deal.id)).toMatchObject({ stage: 'lost', probability: 0, lostReason: 'Price' });
    expect(moved.celebrate).toBeFalsy();
  });

  it('marks a deal won immediately and asks to convert a contact who is not a customer yet', () => {
    const { store, deal, contact } = appStore();
    const moved = moveDeal(store, deal.id, 'won', { now: at(2026, 10, 21, 12) });
    expect(moved).toMatchObject({ ok: true, celebrate: true, askConversion: true });
    expect(store.getById('deals', deal.id).stage).toBe('won');
    expect(store.getAll('customers')).toHaveLength(0);

    const declined = confirmConversion(store, deal.id, false, { now: at(2026, 10, 21, 12) });
    expect(declined.customer).toBeNull();
    expect(store.getById('contacts', contact.id).status).toBe('prospect');

    const accepted = confirmConversion(store, deal.id, true, { now: at(2026, 10, 21, 12) });
    expect(accepted.customer.contactId).toBe(contact.id);
    expect(accepted.customer.convertedDealId).toBe(deal.id);
    expect(store.getById('contacts', contact.id).status).toBe('customer');
    expect(store.getAll('orders')).toEqual([
      expect.objectContaining({
        customerId: accepted.customer.id,
        description: 'Expansion',
        amount: 250000,
        status: 'completed',
        date: '2026-10-21',
      }),
    ]);

    const again = confirmConversion(store, deal.id, true, { now: at(2026, 10, 22, 12) });
    expect(again.customer.id).toBe(accepted.customer.id);
    expect(store.getAll('customers')).toHaveLength(1);
    expect(store.getAll('orders')).toHaveLength(2);
  });

  it('does not ask to convert a contact who is already a customer', () => {
    const { store, deal, contact } = appStore();
    store.update('contacts', contact.id, { status: 'customer' });
    store.create('customers', { contactId: contact.id, convertedDealId: deal.id, convertedAt: at(2026, 1, 1).toISOString() });
    const moved = moveDeal(store, deal.id, 'won', { now: at(2026, 10, 21, 12) });
    expect(moved.askConversion).toBe(false);
  });

  it('does not rewrite stageChangedAt when the stage stays the same', () => {
    const { store, deal } = appStore();
    const before = store.getById('deals', deal.id).stageChangedAt;
    const result = moveDeal(store, deal.id, 'negotiation', { now: at(2026, 10, 21, 12) });
    expect(result.ok).toBe(true);
    expect(store.getById('deals', deal.id).stageChangedAt).toBe(before);
  });
});
