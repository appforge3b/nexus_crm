import { emptyDocument } from './store.js';
import { defaultSettings } from './settings.js';

const PUSH_BATCH = 200;
const PULL_INTERVAL_MS = 60_000;
const FLUSH_DELAY_MS = 600;
const CACHE_DELAY_MS = 500;
const MAX_RETRY_MS = 60_000;

export const cacheKey = (tenantId) => `nexus:t:${tenantId}`;
export const outboxKey = (tenantId) => `nexus:t:${tenantId}:outbox`;
export const metaKey = (tenantId) => `nexus:t:${tenantId}:sync`;

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function changeKey(change) {
  return change.op === 'settings' ? 'settings' : `${change.collection}/${change.id}`;
}

function applyOutbox(doc, changes) {
  for (const change of changes) {
    if (change.op === 'settings') {
      doc.settings = change.data;
      continue;
    }
    const list = doc[change.collection];
    if (!list) continue;
    const index = list.findIndex((item) => item.id === change.id);
    if (change.op === 'delete') {
      if (index >= 0) list.splice(index, 1);
    } else if (index >= 0) list[index] = change.data;
    else list.push(change.data);
  }
}

/**
 * Keeps one tenant's local cache in step with the server.
 * Local changes queue in a persisted outbox (so they survive reloads and offline spells) and are pushed in batches;
 * server changes are pulled after a cursor on start, on focus, on reconnect and every minute.
 * A record with a queued local change is never overwritten by a pull: the local edit is sent next and wins.
 */
export function createSync({
  api,
  storage,
  tenantId,
  cache = null,
  win = typeof window === 'undefined' ? null : window,
  timers = globalThis,
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  onRejected = () => {},
}) {
  let store = null;
  let outbox = readJson(storage, outboxKey(tenantId), []);
  let meta = readJson(storage, metaKey(tenantId), { cursor: null, versions: {}, lastSyncedAt: null });
  let backedByCache = false;
  let counter = Date.now();
  let flushTimer = 0;
  let cacheTimer = 0;
  let retryTimer = 0;
  let retryDelay = 5_000;
  let interval = 0;
  let flushing = null;
  let pulling = null;
  let pullAgain = false;
  let started = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const listeners = new Set();
  let status = { state: isOnline() ? 'idle' : 'offline', pending: outbox.length, lastSyncedAt: meta.lastSyncedAt, error: null };

  const hasValidSnapshot = () => {
    if (!store) return true;
    if (store.persisted) {
      // Heal devices left with an empty localStorage doc + non-empty versions meta from an earlier quota failure.
      if (store.recordCount() === 0 && Object.keys(meta.versions || {}).length > 0 && !backedByCache) return false;
      return true;
    }
    return backedByCache;
  };

  const saveOutbox = () => {
    try { storage.setItem(outboxKey(tenantId), JSON.stringify(outbox)); } catch {}
  };
  const saveMeta = () => {
    try {
      const payload = hasValidSnapshot() ? meta : { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
      storage.setItem(metaKey(tenantId), JSON.stringify(payload));
    } catch {}
  };

  function saveCacheNow() {
    if (!cache || !store || store.persisted) return Promise.resolve(false);
    timers.clearTimeout(cacheTimer);
    return cache.save(tenantId, { doc: store.readState(), meta }).then((ok) => {
      if (ok) {
        backedByCache = true;
        saveMeta();
      }
      return ok;
    });
  }

  function scheduleCacheSave() {
    if (!cache || !store || store.persisted) return;
    timers.clearTimeout(cacheTimer);
    cacheTimer = timers.setTimeout(() => saveCacheNow(), CACHE_DELAY_MS);
  }

  function setStatus(patch) {
    const next = { ...status, ...patch, pending: outbox.length };
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    for (const listener of [...listeners]) listener(status);
  }

  function scheduleRetry() {
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(() => {
      pull().then(flush);
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

  function handleError(error) {
    if (error?.status === 0) setStatus({ state: 'offline', error: null });
    else if (error?.status === 401) setStatus({ state: 'signed-out', error: error.message });
    else if (error?.status === 403) setStatus({ state: 'no-access', error: error.message });
    else {
      setStatus({ state: 'error', error: error?.message || 'Sync failed' });
      scheduleRetry();
    }
  }

  function synced() {
    retryDelay = 5_000;
    meta.lastSyncedAt = new Date().toISOString();
    saveMeta();
    setStatus({ state: 'online', error: null, lastSyncedAt: meta.lastSyncedAt });
  }

  function record(change) {
    const entry = { op: change.op, collection: change.collection ?? null, id: change.id ?? null, data: change.data ?? null, key: changeKey(change), n: ++counter };
    if (change.op === 'upsert') entry.baseVersion = meta.versions[entry.key] ?? null;
    outbox = outbox.filter((item) => item.key !== entry.key);
    outbox.push(entry);
    saveOutbox();
    scheduleCacheSave();
    setStatus({});
    timers.clearTimeout(flushTimer);
    flushTimer = timers.setTimeout(() => flush(), FLUSH_DELAY_MS);
  }

  async function pushBatches() {
    while (outbox.length) {
      const batch = outbox.slice(0, PUSH_BATCH);
      setStatus({ state: 'syncing' });
      const result = await api.post('/api/changes', {
        ops: batch.map(({ op, collection, id, data, baseVersion }) => ({ op, collection, id, data, baseVersion })),
      });
      for (const item of result.results) meta.versions[`${item.collection}/${item.id}`] = item.version;
      const sent = new Map(batch.map((item) => [item.key, item.n]));
      outbox = outbox.filter((item) => sent.get(item.key) !== item.n);
      saveOutbox();
      saveMeta();
      if (result.rejected?.length) onRejected(result.rejected);
    }
  }

  function flush() {
    if (flushing) return flushing;
    if (!outbox.length || !isOnline()) {
      if (!isOnline()) setStatus({ state: 'offline' });
      return Promise.resolve();
    }
    flushing = pushBatches()
      .then(synced, handleError)
      .finally(() => {
        flushing = null;
        setStatus({});
      });
    return flushing;
  }

  function applySnapshot(response) {
    const doc = emptyDocument();
    meta.versions = {};
    for (const item of response.records) {
      if (!Array.isArray(doc[item.collection])) continue;
      doc[item.collection].push(item.data);
      meta.versions[`${item.collection}/${item.id}`] = item.version;
    }
    doc.settings = { ...defaultSettings(), ...(response.settings || {}) };
    applyOutbox(doc, outbox);
    store.replaceState(doc, { detached: true });
    if (store.persisted) backedByCache = false;
  }

  function applyDelta(response) {
    const pending = new Set(outbox.map((item) => item.key));
    for (const item of response.records) meta.versions[`${item.collection}/${item.id}`] = item.version;
    store.applyRemote({
      records: response.records.filter((item) => !pending.has(`${item.collection}/${item.id}`)),
      settings: response.settings && !pending.has('settings') ? response.settings : null,
    });
  }

  async function pullOnce() {
    try {
      const response = await api.get(meta.cursor == null ? '/api/data' : `/api/data?since=${meta.cursor}`);
      const isSnapshot = response.mode === 'snapshot';
      if (isSnapshot) applySnapshot(response);
      else applyDelta(response);
      meta.cursor = response.cursor;
      synced();
      if (!store?.persisted && cache && (isSnapshot || response.records.length || response.settings)) {
        if (isSnapshot) saveCacheNow();
        else scheduleCacheSave();
      }
      resolveReady(true);
      return true;
    } catch (error) {
      handleError(error);
      resolveReady(false);
      return false;
    }
  }

  /** A pull requested while one is in flight runs again afterwards, so callers always see fresh data. */
  async function runPulls() {
    try {
      do {
        pullAgain = false;
        if (!(await pullOnce())) return;
      } while (pullAgain);
    } finally {
      pulling = null;
    }
  }

  function pull() {
    if (pulling) {
      pullAgain = true;
      return pulling;
    }
    if (!isOnline()) {
      setStatus({ state: 'offline' });
      resolveReady(false);
      return Promise.resolve();
    }
    setStatus({ state: status.state === 'online' ? 'online' : 'syncing' });
    pulling = runPulls();
    return pulling;
  }

  const onFocus = () => { pull().then(flush); };
  const onOnline = () => { setStatus({ state: 'syncing' }); flush().then(pull); };
  const onOffline = () => setStatus({ state: 'offline' });
  const onPageHide = () => {
    if (!outbox.length || !isOnline()) return;
    api.post('/api/changes', { ops: outbox.slice(0, PUSH_BATCH).map(({ op, collection, id, data, baseVersion }) => ({ op, collection, id, data, baseVersion })) }, { keepalive: true })
      .catch(() => {});
  };

  return {
    tenantId,
    ready,
    record,
    flush,
    pull,
    attach(target) {
      store = target;
      if (!cache && !hasValidSnapshot()) {
        meta = { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
        saveMeta();
      }
    },
    start() {
      if (started) return;
      started = true;
      if (cache && store && !hasValidSnapshot()) {
        pulling = (async () => {
          try {
            const saved = await cache.load(tenantId);
            if (started && saved?.doc && Array.isArray(saved.doc.contacts)) {
              const doc = saved.doc;
              applyOutbox(doc, outbox);
              store.replaceState(doc, { detached: true });
              if (saved.meta && typeof saved.meta === 'object') {
                meta = {
                  cursor: saved.meta.cursor ?? null,
                  versions: saved.meta.versions ?? {},
                  lastSyncedAt: saved.meta.lastSyncedAt ?? meta.lastSyncedAt,
                };
              }
              backedByCache = true;
              saveMeta();
              setStatus({ state: isOnline() ? 'syncing' : 'offline', lastSyncedAt: meta.lastSyncedAt });
            } else {
              meta = { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
              saveMeta();
            }
          } catch {
            meta = { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
          } finally {
            pulling = null;
          }
          return pull().then(flush);
        })();
      } else {
        pull().then(flush);
      }
      interval = timers.setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden) pull().then(flush);
      }, PULL_INTERVAL_MS);
      win?.addEventListener('focus', onFocus);
      win?.addEventListener('online', onOnline);
      win?.addEventListener('offline', onOffline);
      win?.addEventListener('pagehide', onPageHide);
    },
    stop() {
      started = false;
      timers.clearInterval(interval);
      timers.clearTimeout(flushTimer);
      timers.clearTimeout(cacheTimer);
      timers.clearTimeout(retryTimer);
      win?.removeEventListener('focus', onFocus);
      win?.removeEventListener('online', onOnline);
      win?.removeEventListener('offline', onOffline);
      win?.removeEventListener('pagehide', onPageHide);
    },
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pendingCount: () => outbox.length,
    /**
     * Sends a large set of upserts straight to the server in batches, bypassing the outbox so the
     * browser never holds two copies. Accepted records are written to the cache in one go.
     */
    async pushChanges(ops, { onProgress = () => {} } = {}) {
      if (!isOnline()) throw Object.assign(new Error('Connect to the internet to import'), { status: 0 });
      await flush();
      const accepted = [];
      const rejected = [];
      let conflicts = 0;
      try {
        for (let start = 0; start < ops.length; start += PUSH_BATCH) {
          const batch = ops.slice(start, start + PUSH_BATCH);
          setStatus({ state: 'syncing' });
          const result = await api.post('/api/changes', {
            ops: batch.map(({ op, collection, id, data }) => ({ op, collection, id, data, baseVersion: meta.versions[`${collection}/${id}`] ?? null })),
          });
          const saved = new Set(result.results.map((item) => `${item.collection}/${item.id}`));
          for (const item of result.results) meta.versions[`${item.collection}/${item.id}`] = item.version;
          saveMeta();
          accepted.push(...batch.filter((item) => saved.has(`${item.collection}/${item.id}`)));
          rejected.push(...(result.rejected || []));
          conflicts += result.conflicts?.length || 0;
          onProgress(Math.min(start + PUSH_BATCH, ops.length), ops.length);
        }
      } catch (error) {
        handleError(error);
        throw Object.assign(error, { saved: accepted.length });
      } finally {
        store.applyRemote({ records: accepted.map(({ collection, id, data }) => ({ collection, id, data, deleted: false })) });
        scheduleCacheSave();
      }
      synced();
      return { saved: accepted.length, rejected, conflicts };
    },
    async importDocument(document) {
      const result = await api.post('/api/import', { document });
      outbox = [];
      saveOutbox();
      backedByCache = false;
      await cache?.remove(tenantId);
      meta = { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
      saveMeta();
      await pull();
      return result;
    },
    async clearAll() {
      await api.post('/api/clear');
      outbox = [];
      saveOutbox();
      backedByCache = false;
      await cache?.remove(tenantId);
      meta = { cursor: null, versions: {}, lastSyncedAt: meta.lastSyncedAt };
      saveMeta();
      await pull();
    },
    /** Removes this tenant's cached data from the device (used on sign-out). */
    forget() {
      timers.clearTimeout(cacheTimer);
      backedByCache = false;
      cache?.remove(tenantId);
      for (const key of [cacheKey(tenantId), outboxKey(tenantId), metaKey(tenantId)]) storage.removeItem(key);
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith(`${cacheKey(tenantId)}:backup:`)) storage.removeItem(key);
      }
    },
  };
}
