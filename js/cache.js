const DB_NAME = 'nexus_cache_v1';
const STORE_NAME = 'snapshots';

function openDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(dbPromise, mode, fn) {
  return dbPromise.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    let value;
    if (req) req.onsuccess = () => { value = req.result; };
    tx.oncomplete = () => resolve(value ?? null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/**
 * Lightweight IndexedDB fallback cache for tenants whose JSON snapshot exceeds
 * localStorage's ~5 MB limit. Returns null when IndexedDB is unavailable.
 */
export function createTenantCache(idb = globalThis.indexedDB) {
  if (!idb) return null;
  let dbPromise = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = openDb(idb).catch(() => {
        dbPromise = null;
        return null;
      });
    }
    return dbPromise.then((conn) => {
      if (!conn) throw new Error('IndexedDB unavailable');
      return conn;
    });
  };

  return {
    async load(tenantId) {
      try {
        return await runTx(db(), 'readonly', (store) => store.get(tenantId));
      } catch {
        return null;
      }
    },
    async save(tenantId, payload) {
      try {
        await runTx(db(), 'readwrite', (store) => store.put(payload, tenantId));
        return true;
      } catch {
        return false;
      }
    },
    async remove(tenantId) {
      try {
        await runTx(db(), 'readwrite', (store) => store.delete(tenantId));
      } catch { /* ignore */ }
    },
  };
}

