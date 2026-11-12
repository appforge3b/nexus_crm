import { describe, expect, it, vi } from 'vitest';
import { Store } from '../../js/store.js';
import { createSync, metaKey } from '../../js/sync.js';
import { createTenantCache } from '../../js/cache.js';

function memoryStorage({ maxBytes = Infinity } = {}) {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      const str = String(value);
      if (str.length > maxBytes) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(key, str);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    dump: () => new Map(map),
  };
}

function memoryCache() {
  const docs = new Map();
  return {
    async load(tenantId) {
      return docs.has(tenantId) ? structuredClone(docs.get(tenantId)) : null;
    },
    async save(tenantId, payload) {
      docs.set(tenantId, structuredClone(payload));
      return true;
    },
    async remove(tenantId) {
      docs.delete(tenantId);
    },
    has(tenantId) {
      return docs.has(tenantId);
    },
  };
}

function mockIdb() {
  const map = new Map();
  const makeReq = (fn) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      try {
        req.result = fn();
        req.onsuccess?.();
      } catch (err) {
        req.error = err;
        req.onerror?.();
      }
    });
    return req;
  };
  return {
    open() {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction() {
          const tx = {
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore() {
              const completeAfter = (fn) => makeReq(() => {
                const res = fn();
                queueMicrotask(() => tx.oncomplete?.());
                return res;
              });
              return {
                get: (key) => completeAfter(() => (map.has(key) ? structuredClone(map.get(key)) : undefined)),
                put: (val, key) => completeAfter(() => {
                  map.set(key, structuredClone(val));
                  return key;
                }),
                delete: (key) => completeAfter(() => {
                  map.delete(key);
                  return undefined;
                }),
              };
            },
          };
          return tx;
        },
      };
      return makeReq(() => db);
    },
  };
}

describe('large-tenant cache and sync resilience', () => {
  it('Store.read returns direct arrays and marks persisted=false on cloud quota overflow', () => {
    const storage = memoryStorage({ maxBytes: 150 });
    const store = new Store({
      storage,
      storageKey: 'nexus:t:big',
      seed: false,
      recorder: () => {},
    });
    const created = store.create('contacts', { name: 'Ada Lovelace', company: 'Analytical' });
    expect(store.read('contacts')).toHaveLength(1);
    expect(store.read('contacts')[0].id).toBe(created.id);
    expect(store.getAll('contacts')).not.toBe(store.read('contacts'));

    store.create('contacts', { name: 'Grace Hopper', company: 'Compiler Inc', notes: 'x'.repeat(300) });
    expect(store.persisted).toBe(false);
    expect(storage.getItem('nexus:t:big')).toBeNull();
  });

  it('never advances disk cursor when localStorage overflows and no cache is present', async () => {
    const storage = memoryStorage({ maxBytes: 1200 });
    const store = new Store({ storage, storageKey: 'nexus:t:tnt_big', seed: false, recorder: () => {} });
    const requests = [];
    const api = {
      async get(path) {
        requests.push(path);
        return {
          mode: 'snapshot',
          cursor: 227,
          settings: { currency: '$' },
          settingsVersion: 2,
          records: [
            { collection: 'contacts', id: 'c1', version: 1, deleted: false, data: { id: 'c1', name: 'Big Contact', notes: 'n'.repeat(1500) } },
          ],
        };
      },
      async post() { return { cursor: 227, results: [], conflicts: [] }; },
    };

    const sync = createSync({ tenantId: 'tnt_big', storage, api });
    sync.attach(store);
    sync.start();
    await sync.ready;

    expect(store.persisted).toBe(false);
    expect(store.recordCount()).toBe(1);
    const meta = JSON.parse(storage.getItem(metaKey('tnt_big')));
    expect(meta.cursor).toBeNull();
    sync.stop();

    // Reload into a fresh Store + Sync: should request /api/data (no ?since=227).
    const reloadedStore = new Store({ storage, storageKey: 'nexus:t:tnt_big', seed: false, recorder: () => {} });
    const reloadedSync = createSync({ tenantId: 'tnt_big', storage, api });
    reloadedSync.attach(reloadedStore);
    reloadedSync.start();
    await reloadedSync.ready;
    expect(requests).toEqual(['/api/data', '/api/data']);
    expect(reloadedStore.recordCount()).toBe(1);
    reloadedSync.stop();
  });

  it('self-heals an already-corrupted localStorage cursor when local records are missing', async () => {
    const storage = memoryStorage({ maxBytes: 1200 });
    storage.setItem(metaKey('tnt_big'), JSON.stringify({
      cursor: 227,
      versions: { 'contacts/c1': 1 },
      lastSyncedAt: '2026-11-10T00:00:00.000Z',
    }));
    const store = new Store({ storage, storageKey: 'nexus:t:tnt_big', seed: false, recorder: () => {} });
    const requests = [];
    const api = {
      async get(path) {
        requests.push(path);
        return {
          mode: 'snapshot',
          cursor: 228,
          settings: null,
          records: [{ collection: 'contacts', id: 'c1', version: 1, deleted: false, data: { id: 'c1', name: 'Recovered' } }],
        };
      },
    };

    const sync = createSync({ tenantId: 'tnt_big', storage, api });
    sync.attach(store);
    sync.start();
    await sync.ready;

    expect(requests).toEqual(['/api/data']);
    expect(store.getById('contacts', 'c1')?.name).toBe('Recovered');
    sync.stop();
  });

  it('hydrates from IndexedDB fallback cache on reload and clears cache on clearAll and forget', async () => {
    const storage = memoryStorage({ maxBytes: 1200 });
    const cache = memoryCache();
    const store1 = new Store({ storage, storageKey: 'nexus:t:tnt_big', seed: false, recorder: () => {} });
    const requests = [];
    let cleared = false;
    const api = {
      async get(path) {
        requests.push(path);
        if (!path.includes('since=')) {
          return {
            mode: 'snapshot',
            cursor: cleared ? 229 : 227,
            settings: null,
            records: cleared
              ? []
              : [{ collection: 'contacts', id: 'c1', version: 1, deleted: false, data: { id: 'c1', name: 'Cached Lead', notes: 'y'.repeat(1500) } }],
          };
        }
        return { mode: 'delta', cursor: 228, settings: null, records: [] };
      },
      async post(path) {
        if (path === '/api/clear') cleared = true;
        return { ok: true };
      },
    };

    const sync1 = createSync({ tenantId: 'tnt_big', storage, api, cache });
    sync1.attach(store1);
    sync1.start();
    await sync1.ready;
    await new Promise((r) => setTimeout(r, 20));

    expect(cache.has('tnt_big')).toBe(true);
    expect(JSON.parse(storage.getItem(metaKey('tnt_big'))).cursor).toBe(227);
    sync1.stop();

    // Reload: localStorage has meta (cursor 227), no doc, cache has full snapshot.
    const store2 = new Store({ storage, storageKey: 'nexus:t:tnt_big', seed: false, recorder: () => {} });
    const sync2 = createSync({ tenantId: 'tnt_big', storage, api, cache });
    sync2.attach(store2);
    sync2.start();
    await sync2.ready;

    expect(requests).toEqual(['/api/data', '/api/data?since=227']);
    expect(store2.getById('contacts', 'c1')?.name).toBe('Cached Lead');

    await sync2.clearAll();
    expect(cache.has('tnt_big')).toBe(false);

    await cache.save('tnt_big', { doc: store2.readState(), meta: { cursor: 228 } });
    expect(cache.has('tnt_big')).toBe(true);
    sync2.forget();
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.has('tnt_big')).toBe(false);
    sync2.stop();
  });

  it('createTenantCache handles missing IndexedDB and round-trips snapshots via IDB', async () => {
    expect(createTenantCache(null)).toBeNull();
    const cache = createTenantCache(mockIdb());
    expect(await cache.save('t1', { doc: { contacts: [{ id: 'c1' }] }, meta: { cursor: 5 } })).toBe(true);
    expect(await cache.load('t1')).toEqual({ doc: { contacts: [{ id: 'c1' }] }, meta: { cursor: 5 } });
    await cache.remove('t1');
    expect(await cache.load('t1')).toBeNull();
  });
});

