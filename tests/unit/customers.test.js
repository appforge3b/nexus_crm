import { describe, expect, it } from 'vitest';
import { customerStats, openDealsForContact } from '../../js/customers.js';

describe('customer stats', () => {
  it('sums every order that is not cancelled and dates the last live order', () => {
    const stats = customerStats([
      { amount: 100, status: 'completed', date: '2026-10-01' },
      { amount: 50, status: 'pending', date: '2026-10-20' },
      { amount: 999, status: 'cancelled', date: '2026-10-21' },
    ]);
    expect(stats).toEqual({ revenue: 150, orderCount: 2, average: 75, lastOrderDate: '2026-10-20' });
    expect(customerStats([])).toEqual({ revenue: 0, orderCount: 0, average: 0, lastOrderDate: null });
  });

  it('lists only open deals for the customer contact', () => {
    const deals = [
      { id: 'open', contactId: 'c1', stage: 'negotiation' },
      { id: 'won', contactId: 'c1', stage: 'won' },
      { id: 'other', contactId: 'c2', stage: 'proposal' },
    ];
    expect(openDealsForContact(deals, 'c1').map((deal) => deal.id)).toEqual(['open']);
  });
});
