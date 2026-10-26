import { seedDemoData } from './seed.js';
import { defaultSettings } from './settings.js';
import { validateImport } from './validation.js';
import { CURRENT_VERSION, migrate, needsMigration } from './migrate.js';

export const STORAGE_KEY = 'nexus_data';
export const COLLECTIONS = ['contacts', 'companies', 'deals', 'activities', 'customers', 'orders', 'tags'];

function emptyState() {
  return {
    contacts: [],
    companies: [],
    deals: [],
    activities: [],
    customers: [],
    orders: [],
    tags: [],
    settings: defaultSettings(),
    version: CURRENT_VERSION,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function backupKey(storageKey, label) {
  return `${storageKey}:backup:${label}`;
}

export function emptyDocument() {
  return emptyState();
}

export class Store {
  /** `recorder` (cloud mode) receives every local change so it can be queued for the server. */
  constructor({ storage, clock, seed = false, storageKey = STORAGE_KEY, recorder = null } = {}) {
    this.storage = storage;
    this.clock = clock ?? { now: () => new Date() };
    this.storageKey = storageKey;
    this.recorder = recorder;
    this.listeners = new Set();
    this.state = this.#load(seed);
    this.#persist();
  }

  #fresh(seed) {
    return seed ? seedDemoData(this.clock.now()) : emptyState();
  }

  /** Keeps the first copy of a document under a label; never overwrites an earlier backup. */
  #backup(raw, label) {
    const key = backupKey(this.storageKey, label);
    try {
      if (this.storage.getItem(key) == null) this.storage.setItem(key, raw);
    } catch { /* storage full: the live document is still written below */ }
  }

  #load(seed) {
    const raw = this.storage.getItem(this.storageKey);
    if (raw == null) return this.#fresh(seed);
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch { /* handled below */ }
    if (!parsed || !validateImport(parsed).ok) {
      this.#backup(raw, 'unreadable');
      return this.#fresh(seed);
    }
    if (needsMigration(parsed)) {
      this.#backup(raw, `v${parsed.version}`);
      return migrate(parsed, { now: this.clock.now() });
    }
    return parsed;
  }

  #persist() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  #notify(event) {
    for (const listener of [...this.listeners]) listener(event);
  }

  #assert(collection) {
    if (!COLLECTIONS.includes(collection)) throw new Error(`unknown collection: ${collection}`);
  }

  getAll(collection) {
    this.#assert(collection);
    return clone(this.state[collection]);
  }

  getById(collection, id) {
    this.#assert(collection);
    const found = this.state[collection].find((item) => item.id === id);
    return found ? clone(found) : null;
  }

  create(collection, data) {
    this.#assert(collection);
    const now = this.clock.now().toISOString();
    const entity = {
      ...clone(data),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.state[collection].push(entity);
    this.#persist();
    this.recorder?.({ op: 'upsert', collection, id: entity.id, data: clone(entity) });
    this.#notify({ type: 'create', collection, id: entity.id });
    return clone(entity);
  }

  update(collection, id, data) {
    this.#assert(collection);
    const index = this.state[collection].findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = this.state[collection][index];
    const next = {
      ...current,
      ...clone(data),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.clock.now().toISOString(),
    };
    this.state[collection][index] = next;
    this.#persist();
    this.recorder?.({ op: 'upsert', collection, id, data: clone(next) });
    this.#notify({ type: 'update', collection, id });
    return clone(next);
  }

  delete(collection, id) {
    this.#assert(collection);
    const index = this.state[collection].findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.state[collection].splice(index, 1);
    this.#persist();
    this.recorder?.({ op: 'delete', collection, id });
    this.#notify({ type: 'delete', collection, id });
    return true;
  }

  #write(records) {
    const positions = new Map();
    for (const change of records) {
      if (!COLLECTIONS.includes(change.collection)) continue;
      const list = this.state[change.collection];
      if (!positions.has(change.collection)) positions.set(change.collection, new Map(list.map((item, index) => [item.id, index])));
      const index = positions.get(change.collection).get(change.id);
      if (change.deleted) {
        if (index != null) {
          list.splice(index, 1);
          positions.delete(change.collection);
        }
      } else if (index != null) {
        list[index] = clone(change.data);
      } else {
        positions.get(change.collection).set(change.id, list.length);
        list.push(clone(change.data));
      }
    }
  }

  /** Server changes: written straight to the cache, never echoed back to the recorder. */
  applyRemote({ records = [], settings = null } = {}) {
    if (!records.length && !settings) return;
    this.#write(records);
    if (settings) this.state.settings = { ...defaultSettings(), ...clone(settings) };
    this.#persist();
    this.#notify({ type: 'sync', collection: null, id: null });
  }

  /** Bulk local upserts (spreadsheet import): one write and one notification for any number of records. */
  applyChanges(ops) {
    if (!ops.length) return;
    const before = this.state;
    this.state = { ...before, ...Object.fromEntries(COLLECTIONS.map((collection) => [collection, [...before[collection]]])) };
    this.#write(ops.map((op) => ({ collection: op.collection, id: op.id, data: op.data })));
    try {
      this.#persist();
    } catch (error) {
      this.state = before;
      throw Object.assign(new Error('This browser is out of storage space for NEXUS, so nothing was imported. Import a smaller file, or use a cloud workspace.'), { cause: error });
    }
    for (const op of ops) this.recorder?.({ op: 'upsert', collection: op.collection, id: op.id, data: clone(op.data) });
    this.#notify({ type: 'import', collection: null, id: null });
  }

  replaceState(state) {
    this.state = { ...emptyState(), ...clone(state), version: CURRENT_VERSION };
    this.#persist();
    this.#notify({ type: 'sync', collection: null, id: null });
  }

  recordCount() {
    return COLLECTIONS.reduce((sum, collection) => sum + this.state[collection].length, 0);
  }

  query(collection, filterFn) {
    return this.getAll(collection).filter(filterFn);
  }

  exportAll() {
    return JSON.stringify(this.state);
  }

  importAll(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('invalid JSON');
    }
    if (!validateImport(parsed).ok) throw new Error('invalid import');
    this.state = needsMigration(parsed) ? migrate(parsed, { now: this.clock.now() }) : parsed;
    this.#persist();
    this.#notify({ type: 'import', collection: null, id: null });
  }

  getSettings() {
    return clone(this.state.settings);
  }

  updateSettings(partial) {
    this.state.settings = { ...this.state.settings, ...clone(partial) };
    this.#persist();
    this.recorder?.({ op: 'settings', data: clone(this.state.settings) });
    this.#notify({ type: 'update', collection: 'settings', id: null });
    return this.getSettings();
  }

  subscribe(callback) {
    this.listeners.add(callback);
  }

  unsubscribe(callback) {
    this.listeners.delete(callback);
  }

  clearAll() {
    this.state = emptyState();
    this.#persist();
    this.#notify({ type: 'clear', collection: null, id: null });
  }

  resetDemo() {
    this.state = seedDemoData(this.clock.now());
    this.#persist();
    this.#notify({ type: 'reset', collection: null, id: null });
  }
}
