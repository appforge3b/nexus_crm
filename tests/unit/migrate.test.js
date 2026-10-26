import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, companyKey, migrate, needsMigration } from '../../js/migrate.js';
import { STORAGE_KEY, Store, backupKey } from '../../js/store.js';
import { at, frozenClock, memoryStorage } from '../helpers/time.js';

const NOW = at(2026, 10, 21, 9);

function v1Snapshot() {
  return {
    version: 1,
    settings: { userName: 'Puja', currency: '₹', stages: [] },
    tags: [{ id: 't1', name: 'Enterprise', color: '#6366f1' }],
    contacts: [
      { id: 'c1', name: 'Priya Sharma', company: 'Helios Bank', status: 'customer', tags: ['t1'], createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'c2', name: 'Arun Das', company: '  helios   bank ', status: 'customer', tags: [], createdAt: '2026-03-02T00:00:00.000Z' },
      { id: 'c3', name: 'Solo Founder', company: '', status: 'prospect', tags: [] },
      { id: 'c4', name: 'Meera Nair', company: 'Lumen Health', status: 'active', tags: [] },
    ],
    deals: [
      { id: 'd1', title: 'Core banking', contactId: 'c1', value: 100, stage: 'won' },
      { id: 'd2', title: 'Treasury', contactId: 'c2', value: 50, stage: 'proposal' },
      { id: 'd3', title: 'Side project', contactId: 'c3', value: 5, stage: 'prospect' },
    ],
    activities: [
      { id: 'a1', type: 'call', contactId: 'c1', dealId: 'd1', title: 'Kickoff', date: '2026-10-01T09:00:00.000Z' },
      { id: 'a2', type: 'note', contactId: 'c3', dealId: null, title: 'Idea', date: '2026-10-02T09:00:00.000Z' },
    ],
    customers: [
      { id: 'k1', contactId: 'c1', convertedDealId: 'd1', convertedAt: '2026-02-01T00:00:00.000Z', satisfactionRating: null, notes: 'Likes email' },
      { id: 'k2', contactId: 'c2', convertedDealId: 'd1', convertedAt: '2026-04-01T00:00:00.000Z', satisfactionRating: 4, notes: 'Prefers calls' },
    ],
    orders: [
      { id: 'o1', customerId: 'k1', description: 'Licence', amount: 100, status: 'completed', date: '2026-02-01' },
      { id: 'o2', customerId: 'k2', description: 'Support', amount: 40, status: 'completed', date: '2026-04-01' },
    ],
  };
}

describe('migrating a version 1 document', () => {
  const next = migrate(v1Snapshot(), { now: NOW });

  it('groups contacts into companies by normalised name and keeps every record', () => {
    expect(next.version).toBe(CURRENT_VERSION);
    expect(next.companies.map((company) => company.name).sort()).toEqual(['Helios Bank', 'Lumen Health']);
    const helios = next.companies.find((company) => company.name === 'Helios Bank');
    expect(next.contacts.find((c) => c.id === 'c1').companyId).toBe(helios.id);
    expect(next.contacts.find((c) => c.id === 'c2').companyId).toBe(helios.id);
    expect(next.contacts.find((c) => c.id === 'c2').company).toBe('Helios Bank');
    expect(next.contacts.find((c) => c.id === 'c3').companyId).toBeNull();
    expect(helios.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(next.contacts).toHaveLength(4);
    expect(next.deals).toHaveLength(3);
    expect(next.activities).toHaveLength(2);
    expect(next.orders).toHaveLength(2);
    expect(next.tags).toEqual(v1Snapshot().tags);
    expect(next.settings.userName).toBe('Puja');
  });

  it('links deals, activities, and customers to the company and seeds stakeholders', () => {
    const helios = next.companies.find((company) => company.name === 'Helios Bank');
    const d2 = next.deals.find((deal) => deal.id === 'd2');
    expect(d2.companyId).toBe(helios.id);
    expect(d2.stakeholders).toEqual([{ contactId: 'c2', role: '' }]);
    expect(next.deals.find((deal) => deal.id === 'd3').companyId).toBeNull();
    expect(next.activities.every((activity) => activity.status === 'done')).toBe(true);
    expect(next.activities.find((activity) => activity.id === 'a1').companyId).toBe(helios.id);
  });

  it('merges customers at the same company into the earliest one, moving orders', () => {
    expect(next.customers).toHaveLength(1);
    const [customer] = next.customers;
    expect(customer.id).toBe('k1');
    expect(customer.satisfactionRating).toBe(4);
    expect(customer.notes).toBe('Likes email\n\nPrefers calls');
    expect(next.orders.every((order) => order.customerId === 'k1')).toBe(true);
  });

  it('is idempotent and normalises company keys', () => {
    expect(needsMigration(next)).toBe(false);
    expect(migrate(next, { now: NOW })).toEqual(next);
    expect(companyKey('  Helios   BANK ')).toBe('helios bank');
  });
});

describe('store loading of older documents', () => {
  it('migrates a stored v1 document in place and keeps a backup of the original', () => {
    const raw = JSON.stringify(v1Snapshot());
    const storage = memoryStorage({ nexus_scrm_data: raw });
    const store = new Store({ storage, clock: frozenClock(NOW), seed: false, storageKey: 'nexus_scrm_data' });
    expect(store.getAll('contacts')).toHaveLength(4);
    expect(store.getAll('companies')).toHaveLength(2);
    expect(JSON.parse(storage.getItem('nexus_scrm_data')).version).toBe(CURRENT_VERSION);
    expect(storage.getItem(backupKey('nexus_scrm_data', 'v1'))).toBe(raw);
  });

  it('backs up unreadable data before falling back, and never overwrites an earlier backup', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"broken"' });
    new Store({ storage, clock: frozenClock(NOW), seed: false });
    expect(storage.getItem(backupKey(STORAGE_KEY, 'unreadable'))).toBe('{"broken"');
    storage.setItem(STORAGE_KEY, 'also broken');
    new Store({ storage, clock: frozenClock(NOW), seed: false });
    expect(storage.getItem(backupKey(STORAGE_KEY, 'unreadable'))).toBe('{"broken"');
  });

  it('migrates a v1 backup file on import', () => {
    const store = new Store({ storage: memoryStorage(), clock: frozenClock(NOW), seed: false });
    store.importAll(JSON.stringify(v1Snapshot()));
    expect(store.getAll('companies')).toHaveLength(2);
    expect(store.getAll('customers')).toHaveLength(1);
  });
});
