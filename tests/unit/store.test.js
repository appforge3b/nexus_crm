import { describe, expect, it } from 'vitest';
import { COLLECTIONS, STORAGE_KEY, Store } from '../../js/store.js';
import { at, frozenClock, memoryStorage } from '../helpers/time.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setup(storageData) {
  const storage = memoryStorage(storageData);
  const clock = frozenClock(at(2026, 10, 21, 9));
  const store = new Store({ storage, clock, seed: false });
  return { storage, clock, store };
}

describe('Store persistence contract', () => {
  it('uses the single localStorage key and the top-level collections', () => {
    expect(STORAGE_KEY).toBe('nexus_data');
    expect(COLLECTIONS).toEqual(['contacts', 'companies', 'deals', 'activities', 'customers', 'orders', 'tags']);
  });

  it('starts from empty collections, version 2, and default settings when nothing is stored', () => {
    const { store, storage } = setup();
    for (const name of COLLECTIONS) expect(store.getAll(name)).toEqual([]);
    const raw = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(raw.version).toBe(2);
    expect(raw.settings.userName).toBe('there');
    expect(raw.settings.currency).toBe('₹');
    expect(raw.settings.stages.map((stage) => stage.id)).toEqual([
      'prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won', 'lost',
    ]);
  });

  it('creates an entity with a uuid and clock timestamps, and returns a detached copy', () => {
    const { store } = setup();
    const created = store.create('contacts', { name: 'Ravi Krishnan', status: 'prospect' });
    expect(created.id).toMatch(UUID);
    expect(created.createdAt).toBe(at(2026, 10, 21, 9).toISOString());
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.name).toBe('Ravi Krishnan');
    expect(store.getById('contacts', created.id).status).toBe('prospect');

    created.name = 'Hacked';
    expect(store.getById('contacts', created.id).name).toBe('Ravi Krishnan');
  });

  it('getAll returns a copy that cannot grow or mutate the persisted record', () => {
    const { store, storage, clock } = setup();
    const created = store.create('tags', { name: 'Tech', color: '#6366f1' });
    const all = store.getAll('tags');
    all.push({ id: 'extra' });
    all[0].name = 'Nope';
    expect(store.getAll('tags')).toHaveLength(1);

    const reloaded = new Store({ storage, clock, seed: false });
    expect(reloaded.getById('tags', created.id).name).toBe('Tech');
  });

  it('gets by id, updates without touching id or createdAt, and deletes', () => {
    const { store, clock } = setup();
    const created = store.create('deals', { title: 'Radar', value: 10, stage: 'prospect' });
    expect(store.getById('deals', 'missing')).toBeNull();

    clock.set(at(2026, 10, 22, 9));
    const updated = store.update('deals', created.id, { title: 'Radar v2', value: 12 });
    expect(updated.title).toBe('Radar v2');
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe(at(2026, 10, 22, 9).toISOString());
    expect(store.update('deals', 'missing', { title: 'x' })).toBeNull();

    expect(store.delete('deals', created.id)).toBe(true);
    expect(store.getById('deals', created.id)).toBeNull();
    expect(store.delete('deals', created.id)).toBe(false);
  });

  it('queries without mutating and rejects unknown collections', () => {
    const { store } = setup();
    store.create('contacts', { name: 'A', status: 'prospect' });
    store.create('contacts', { name: 'B', status: 'customer' });
    const found = store.query('contacts', (contact) => contact.status === 'customer');
    expect(found.map((contact) => contact.name)).toEqual(['B']);
    expect(() => store.getAll('settings')).toThrow(/unknown collection/i);
    expect(() => store.create('users', {})).toThrow(/unknown collection/i);
  });

  it('notifies subscribers on writes and stops after unsubscribe', () => {
    const { store } = setup();
    const events = [];
    const listener = (event) => events.push(event);
    store.subscribe(listener);

    const created = store.create('orders', { description: 'Renewal', amount: 10, status: 'pending' });
    store.update('orders', created.id, { status: 'completed' });
    store.delete('orders', created.id);
    store.unsubscribe(listener);
    store.create('orders', { description: 'Ignored', amount: 1, status: 'pending' });

    expect(events.map((event) => event.type)).toEqual(['create', 'update', 'delete']);
    expect(events[0]).toMatchObject({ collection: 'orders', id: created.id });
    expect(events[1].id).toBe(created.id);
  });

  it('round-trips export and import, and a bad import leaves existing data alone', () => {
    const { store } = setup();
    const contact = store.create('contacts', { name: 'Priya', status: 'active' });
    const json = store.exportAll();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.contacts).toHaveLength(1);

    store.create('contacts', { name: 'Other', status: 'prospect' });
    store.importAll(json);
    expect(store.getAll('contacts').map((item) => item.name)).toEqual(['Priya']);
    expect(store.getById('contacts', contact.id).name).toBe('Priya');

    expect(() => store.importAll('{')).toThrow(/invalid/i);
    expect(() => store.importAll(JSON.stringify({ contacts: [] }))).toThrow(/invalid/i);
    expect(store.getAll('contacts')).toHaveLength(1);
  });

  it('persists settings merges and treats an explicit empty document as cleared, not missing', () => {
    const { store, storage, clock } = setup();
    store.updateSettings({ userName: 'Puja', currency: '$' });
    expect(store.getSettings()).toMatchObject({ userName: 'Puja', currency: '$' });

    store.create('contacts', { name: 'Keep', status: 'prospect' });
    store.clearAll();
    expect(store.getAll('contacts')).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(store.getSettings().userName).toBe('there');

    const reloaded = new Store({ storage, clock, seed: true });
    expect(reloaded.getAll('contacts')).toEqual([]);
  });

  it('seeds only when the storage key is absent, and recovers from corrupt JSON by seeding', () => {
    const clock = frozenClock(at(2026, 10, 21, 9));
    const empty = memoryStorage();
    const seeded = new Store({ storage: empty, clock, seed: true });
    expect(seeded.getAll('contacts').length).toBeGreaterThanOrEqual(6);
    expect(seeded.getAll('tags').map((tag) => tag.name)).toEqual(expect.arrayContaining(['Enterprise', 'Hot Lead']));

    const corrupt = memoryStorage({ [STORAGE_KEY]: '{' });
    const recovered = new Store({ storage: corrupt, clock, seed: true });
    expect(recovered.getAll('deals').length).toBeGreaterThanOrEqual(10);

    const corruptEmpty = memoryStorage({ [STORAGE_KEY]: '{' });
    const blank = new Store({ storage: corruptEmpty, clock, seed: false });
    expect(blank.getAll('contacts')).toEqual([]);
  });

  it('resetDemo replaces the document with the demo seed', () => {
    const { store } = setup();
    store.create('contacts', { name: 'Temporary', status: 'inactive' });
    store.resetDemo();
    expect(store.getAll('contacts').some((contact) => contact.name === 'Temporary')).toBe(false);
    expect(store.getAll('contacts').length).toBeGreaterThanOrEqual(6);
    expect(store.getAll('customers').length).toBeGreaterThanOrEqual(2);
  });
});
