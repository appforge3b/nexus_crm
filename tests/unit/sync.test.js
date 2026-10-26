import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../js/store.js';
import { cacheKey, createSync, outboxKey } from '../../js/sync.js';
import { ApiError, createApi } from '../../js/api.js';
import { fakeServer, manualTimers, settle } from '../helpers/fake-server.js';

const TENANT = 'tnt_helios';
const clock = { now: () => new Date(2026, 9, 21, 9, 0, 0) };

function boot(server, { online = () => true, onRejected } = {}) {
  const timers = manualTimers();
  const sync = createSync({ api: server.api, storage: localStorage, tenantId: TENANT, timers, win: null, isOnline: online, onRejected });
  const store = new Store({ storage: localStorage, clock, storageKey: cacheKey(TENANT), recorder: sync.record });
  sync.attach(store);
  return { sync, store, timers };
}

beforeEach(() => localStorage.clear());

describe('sync client', () => {
  it('loads a snapshot into the tenant cache, then pushes local changes after a short debounce', async () => {
    const server = fakeServer();
    server.seed('contacts', { id: 'c1', name: 'Priya Sharma' });
    const { sync, store, timers } = boot(server);
    sync.start();
    expect(await sync.ready).toBe(true);
    expect(store.getAll('contacts').map((c) => c.name)).toEqual(['Priya Sharma']);
    expect(JSON.parse(localStorage.getItem(cacheKey(TENANT))).contacts).toHaveLength(1);

    const created = store.create('contacts', { name: 'Ravi Krishnan' });
    store.updateSettings({ currency: '$' });
    expect(sync.status().pending).toBe(2);
    timers.runAll();
    await settle();
    expect(server.live('contacts').map((c) => c.name).sort()).toEqual(['Priya Sharma', 'Ravi Krishnan']);
    expect(server.settings.currency).toBe('$');
    expect(sync.status()).toMatchObject({ state: 'online', pending: 0 });

    store.update('contacts', created.id, { name: 'Ravi K.' });
    const queued = JSON.parse(localStorage.getItem(outboxKey(TENANT)));
    expect(queued[0]).toMatchObject({ op: 'upsert', id: created.id, baseVersion: 1 });
  });

  it('keeps changes made offline in a persisted outbox and sends them after a reload', async () => {
    const server = fakeServer();
    let online = false;
    const first = boot(server, { online: () => online });
    first.sync.start();
    first.store.create('contacts', { name: 'Offline Olivia' });
    first.timers.runAll();
    await settle();
    expect(first.sync.status()).toMatchObject({ state: 'offline', pending: 1 });
    expect(server.live('contacts')).toEqual([]);
    first.sync.stop();

    online = true;
    const second = boot(server, { online: () => online });
    expect(second.store.getAll('contacts').map((c) => c.name)).toEqual(['Offline Olivia']);
    expect(second.sync.pendingCount()).toBe(1);
    second.sync.start();
    await second.sync.ready;
    await settle();
    expect(server.live('contacts').map((c) => c.name)).toEqual(['Offline Olivia']);
    expect(second.store.getAll('contacts')).toHaveLength(1);
  });

  it('applies teammates’ changes and deletions, but never overwrites a record with an unsent local edit', async () => {
    const server = fakeServer();
    server.seed('contacts', { id: 'c1', name: 'Priya' });
    server.seed('contacts', { id: 'c2', name: 'Rohan' });
    const { sync, store } = boot(server);
    sync.start();
    await sync.ready;
    const events = vi.fn();
    store.subscribe(events);

    store.update('contacts', 'c1', { name: 'Priya (mine)' });
    server.seed('contacts', { id: 'c1', name: 'Priya (theirs)' });
    server.seed('contacts', { id: 'c3', name: 'Kavya' });
    server.remove('contacts', 'c2');
    await sync.pull();

    expect(store.getAll('contacts').map((c) => c.name).sort()).toEqual(['Kavya', 'Priya (mine)']);
    expect(events).toHaveBeenCalledWith({ type: 'sync', collection: null, id: null });
    await sync.flush();
    expect(server.live('contacts').find((c) => c.id === 'c1').name).toBe('Priya (mine)');
  });

  it('reports rejected records, a signed-out session and being offline through its status', async () => {
    const server = fakeServer();
    const onRejected = vi.fn();
    const { sync, store } = boot(server, { onRejected });
    sync.start();
    await sync.ready;
    store.create('contacts', { name: ' ' });
    await sync.flush();
    expect(onRejected).toHaveBeenCalledWith([expect.objectContaining({ message: 'Name is required' })]);
    expect(sync.pendingCount()).toBe(0);

    server.failWith = new ApiError(401, 'unauthenticated', 'Please sign in');
    await sync.pull();
    expect(sync.status().state).toBe('signed-out');

    server.failWith = null;
    server.offline = true;
    await sync.pull();
    expect(sync.status().state).toBe('offline');
  });

  it('imports into an empty workspace, clears it, and forgets the device copy on sign-out', async () => {
    const server = fakeServer();
    const { sync, store } = boot(server);
    sync.start();
    await sync.ready;
    await sync.importDocument({ version: 2, contacts: [{ id: 'c1', name: 'Imported' }], companies: [], deals: [], activities: [], customers: [], orders: [], tags: [], settings: { currency: '€' } });
    expect(store.getAll('contacts').map((c) => c.name)).toEqual(['Imported']);
    expect(store.getSettings().currency).toBe('€');
    await expect(sync.importDocument({ version: 2, contacts: [], companies: [], deals: [], activities: [], customers: [], orders: [], tags: [], settings: {} }))
      .rejects.toMatchObject({ code: 'not_empty' });

    await sync.clearAll();
    expect(store.getAll('contacts')).toEqual([]);

    sync.forget();
    expect(localStorage.getItem(cacheKey(TENANT))).toBeNull();
  });
});

describe('api client', () => {
  it('sends JSON with the X-Nexus header on mutations and turns failures into ApiError', async () => {
    const fetch = vi.fn(async (url, init) => {
      if (url === '/api/fail') return new Response(JSON.stringify({ error: 'forbidden', message: 'Nope' }), { status: 403 });
      return new Response(JSON.stringify({ ok: true, echo: init.body ? JSON.parse(init.body) : null }), { status: 200 });
    });
    const api = createApi({ fetch });
    expect(await api.post('/api/x', { a: 1 })).toEqual({ ok: true, echo: { a: 1 } });
    expect(fetch.mock.calls[0][1].headers['x-nexus']).toBe('1');
    await api.get('/api/y');
    expect(fetch.mock.calls[1][1].headers['x-nexus']).toBeUndefined();
    await expect(api.get('/api/fail')).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'Nope' });
    const offline = createApi({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(offline.get('/api/me')).rejects.toMatchObject({ status: 0, code: 'offline' });
  });
});
