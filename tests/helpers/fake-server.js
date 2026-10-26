import { ApiError } from '../../js/api.js';

/** In-memory stand-in for the NEXUS API with the same cursor/version rules as server/repo.js. */
export function fakeServer({ me = null } = {}) {
  const records = new Map();
  let settings = null;
  let seq = 0;
  const server = {
    me,
    offline: false,
    failWith: null,
    calls: [],
    records,
    get cursor() { return seq; },
    get settings() { return settings; },
    seed(collection, data) {
      seq += 1;
      const key = `${collection}/${data.id}`;
      records.set(key, { collection, id: data.id, data, version: (records.get(key)?.version ?? 0) + 1, seq, deleted: false });
    },
    remove(collection, id) {
      seq += 1;
      const key = `${collection}/${id}`;
      records.set(key, { collection, id, data: null, version: (records.get(key)?.version ?? 0) + 1, seq, deleted: true });
    },
    live(collection) {
      return [...records.values()].filter((r) => r.collection === collection && !r.deleted).map((r) => r.data);
    },
    async handle(method, path, body) {
      server.calls.push({ method, path, body });
      if (server.offline) throw new ApiError(0, 'offline', 'You appear to be offline');
      if (server.failWith) throw server.failWith;
      const url = new URL(path, 'https://scrm.test');
      if (method === 'GET' && url.pathname === '/api/me') return server.me;
      if (method === 'GET' && url.pathname === '/api/data') {
        const since = url.searchParams.get('since');
        const list = [...records.values()];
        if (since == null || Number(since) > seq) {
          return { mode: 'snapshot', cursor: seq, records: list.filter((r) => !r.deleted).map(({ seq: _, ...r }) => r), settings, settingsVersion: 0 };
        }
        return { mode: 'delta', cursor: seq, records: list.filter((r) => r.seq > Number(since)).map(({ seq: _, ...r }) => r), settings: null, settingsVersion: 0 };
      }
      if (method === 'POST' && url.pathname === '/api/changes') {
        seq += 1;
        const results = [];
        const rejected = [];
        for (const op of body.ops) {
          if (op.op === 'settings') { settings = op.data; continue; }
          if (op.op === 'upsert' && !String(op.data?.name ?? op.data?.title ?? 'x').trim()) {
            rejected.push({ collection: op.collection, id: op.id, op: op.op, message: 'Name is required' });
            continue;
          }
          const key = `${op.collection}/${op.id}`;
          const version = (records.get(key)?.version ?? 0) + 1;
          records.set(key, { collection: op.collection, id: op.id, data: op.op === 'delete' ? null : op.data, version, seq, deleted: op.op === 'delete' });
          results.push({ collection: op.collection, id: op.id, version, deleted: op.op === 'delete' });
        }
        return { cursor: seq, results, rejected, conflicts: [], settingsVersion: null };
      }
      if (method === 'POST' && url.pathname === '/api/import') {
        if ([...records.values()].some((r) => !r.deleted)) throw new ApiError(409, 'not_empty', 'Import is only available while the workspace is empty. Clear the data first.');
        for (const collection of ['contacts', 'companies', 'deals', 'activities', 'customers', 'orders', 'tags']) {
          for (const item of body.document[collection] || []) server.seed(collection, item);
        }
        settings = body.document.settings;
        return { cursor: seq, counts: {} };
      }
      if (method === 'POST' && url.pathname === '/api/clear') {
        for (const r of [...records.values()]) if (!r.deleted) server.remove(r.collection, r.id);
        return { cursor: seq, removed: 0 };
      }
      if (server.routes?.[`${method} ${url.pathname}`]) return server.routes[`${method} ${url.pathname}`](body, url);
      throw new ApiError(404, 'not_found', 'Not found');
    },
    api: null,
  };
  server.api = {
    get: (path) => server.handle('GET', path),
    post: (path, body = {}) => server.handle('POST', path, body),
    patch: (path, body = {}) => server.handle('PATCH', path, body),
    del: (path) => server.handle('DELETE', path),
  };
  return server;
}

export function manualTimers() {
  const queue = new Map();
  let id = 0;
  return {
    setTimeout(fn) { id += 1; queue.set(id, fn); return id; },
    clearTimeout(timer) { queue.delete(timer); },
    setInterval() { return 0; },
    clearInterval() {},
    runAll() {
      const fns = [...queue.values()];
      queue.clear();
      fns.forEach((fn) => fn());
    },
  };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
