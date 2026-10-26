import { beforeEach, describe, expect, it } from 'vitest';
import { resetGoogleKeyCache } from '../../server/google.js';
import { COLLECTIONS as SERVER_COLLECTIONS } from '../../server/repo.js';
import { COLLECTIONS as STORE_COLLECTIONS } from '../../js/store.js';
import { addMember, call, contact, google, json, tenantWithOwner } from './helpers.js';

beforeEach(() => {
  resetGoogleKeyCache();
  google.tokenFor = null;
});

const upsert = (collection, data, baseVersion) => ({ op: 'upsert', collection, id: data.id, data, baseVersion });

function v1Document() {
  return {
    version: 1,
    contacts: [
      { id: 'c1', name: 'Priya Sharma', company: 'Helios Bank', email: 'priya@helios.example', tags: [], createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'c2', name: 'Rohan Desai', company: 'helios bank ', tags: [], createdAt: '2026-01-03T00:00:00.000Z' },
    ],
    deals: [{ id: 'd1', title: 'Core banking', contactId: 'c1', value: 850000, stage: 'proposal' }],
    activities: [{ id: 'a1', type: 'call', title: 'Intro call', contactId: 'c1', dealId: 'd1', date: '2026-02-01T10:00:00.000Z' }],
    customers: [],
    orders: [],
    tags: [{ id: 't1', name: 'Enterprise', color: '#6366f1' }],
    settings: { userName: 'Puja', currency: '₹', stages: [] },
  };
}

describe('sync API', () => {
  it('keeps the server and the browser store in agreement about which collections exist', () => {
    expect([...SERVER_COLLECTIONS].sort()).toEqual([...STORE_COLLECTIONS].sort());
  });

  it('round-trips changes: snapshot, versions, deltas after a cursor, tombstones and settings', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const empty = await json(await call('GET', '/api/data', { cookie: owner }));
    expect(empty.body).toMatchObject({ mode: 'snapshot', cursor: 0, records: [], settings: null });

    const first = await json(await call('POST', '/api/changes', {
      cookie: owner,
      body: { ops: [upsert('contacts', contact('c1')), upsert('contacts', contact('c2', 'Ravi')), { op: 'settings', data: { currency: '$' } }] },
    }));
    expect(first.status).toBe(200);
    expect(first.body.cursor).toBe(1);
    expect(first.body.results.map((r) => [r.id, r.version])).toEqual([['c1', 1], ['c2', 1]]);
    expect(first.body.settingsVersion).toBe(1);

    const second = await json(await call('POST', '/api/changes', {
      cookie: owner,
      body: { ops: [upsert('contacts', contact('c1', 'Asha R.'), 1), { op: 'delete', collection: 'contacts', id: 'c2' }] },
    }));
    expect(second.body.cursor).toBe(2);
    expect(second.body.conflicts).toEqual([]);

    const delta = await json(await call('GET', '/api/data?since=1', { cookie: owner }));
    expect(delta.body.mode).toBe('delta');
    expect(delta.body.records).toEqual([
      { collection: 'contacts', id: 'c1', version: 2, deleted: false, data: contact('c1', 'Asha R.') },
      { collection: 'contacts', id: 'c2', version: 2, deleted: true, data: null },
    ]);
    expect(delta.body.settings).toBeNull();

    const snapshot = await json(await call('GET', '/api/data', { cookie: owner }));
    expect(snapshot.body.records.map((r) => r.id)).toEqual(['c1']);
    expect(snapshot.body.settings).toEqual({ currency: '$' });

    const ahead = await json(await call('GET', '/api/data?since=99', { cookie: owner }));
    expect(ahead.body.mode).toBe('snapshot');
  });

  it('applies the newest write and reports it as a conflict when the base version is stale', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const teammate = await addMember(owner, 'ravi@gmail.com');
    await call('POST', '/api/changes', { cookie: owner, body: { ops: [upsert('contacts', contact('c1'))] } });
    await call('POST', '/api/changes', { cookie: teammate, body: { ops: [upsert('contacts', contact('c1', 'By Ravi'), 1)] } });
    const late = await json(await call('POST', '/api/changes', { cookie: owner, body: { ops: [upsert('contacts', contact('c1', 'By Priya'), 1)] } }));
    expect(late.body.conflicts).toEqual([{ collection: 'contacts', id: 'c1' }]);
    expect(late.body.results[0].version).toBe(3);
    const snapshot = await json(await call('GET', '/api/data', { cookie: teammate }));
    expect(snapshot.body.records[0].data.name).toBe('By Priya');
  });

  it('rejects invalid records individually and still saves the rest', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const response = await json(await call('POST', '/api/changes', {
      cookie: owner,
      body: {
        ops: [
          upsert('contacts', contact('ok')),
          upsert('contacts', { id: 'nameless', name: '  ' }),
          upsert('secrets', { id: 'x' }),
          { op: 'upsert', collection: 'deals', id: 'd1', data: { id: 'other', title: 'x', contactId: 'c', value: 1 } },
          upsert('deals', { id: 'd2', title: 'Valid deal', contactId: 'ok', value: 10, stage: 'prospect' }),
        ],
      },
    }));
    expect(response.body.results.map((r) => r.id).sort()).toEqual(['d2', 'ok']);
    expect(response.body.rejected.map((r) => [r.id, r.message])).toEqual([
      ['nameless', 'Name is required'],
      ['x', 'Unknown collection'],
      ['d1', 'Record id does not match'],
    ]);
    const tooMany = await call('POST', '/api/changes', { cookie: owner, body: { ops: Array.from({ length: 501 }, (_, i) => upsert('contacts', contact(`c${i}`))) } });
    expect(tooMany.status).toBe(413);
  });
});

describe('tenant isolation', () => {
  it('never shows or changes records in another tenant, even with the same record ids', async () => {
    const helios = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const orbit = await tenantWithOwner('Orbit Labs', 'arjun@gmail.com');
    await call('POST', '/api/changes', { cookie: helios.owner, body: { ops: [upsert('contacts', contact('shared-id', 'Helios secret'))] } });
    await call('POST', '/api/changes', { cookie: orbit.owner, body: { ops: [upsert('contacts', contact('shared-id', 'Orbit person')), { op: 'delete', collection: 'contacts', id: 'helios-only' }] } });

    const heliosView = await json(await call('GET', '/api/data', { cookie: helios.owner }));
    const orbitView = await json(await call('GET', '/api/data', { cookie: orbit.owner }));
    expect(heliosView.body.records.map((r) => r.data.name)).toEqual(['Helios secret']);
    expect(orbitView.body.records.map((r) => r.data.name)).toEqual(['Orbit person']);
    expect(heliosView.body.records[0].version).toBe(1);

    const smuggled = await json(await call('POST', '/api/changes', {
      cookie: orbit.owner,
      body: { tenantId: helios.tenant.id, ops: [upsert('contacts', contact('shared-id', 'Overwritten?'))] },
    }));
    expect(smuggled.status).toBe(200);
    expect((await json(await call('GET', `/api/data?tenantId=${helios.tenant.id}`, { cookie: orbit.owner }))).body.records[0].data.name).toBe('Overwritten?');
    expect((await json(await call('GET', '/api/data', { cookie: helios.owner }))).body.records[0].data.name).toBe('Helios secret');

    const cleared = await json(await call('POST', '/api/clear', { cookie: orbit.owner }));
    expect(cleared.body.removed).toBe(1);
    expect((await json(await call('GET', '/api/data', { cookie: helios.owner }))).body.records).toHaveLength(1);
  });

  it('does not let a member of one workspace switch into another to read it', async () => {
    const helios = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const orbit = await tenantWithOwner('Orbit Labs', 'arjun@gmail.com');
    const attempt = await call('POST', '/api/session/tenant', { cookie: orbit.owner, body: { tenantId: helios.tenant.id } });
    expect(attempt.status).toBe(404);
  });
});

describe('import and clear', () => {
  it('imports a version 1 backup once, migrating it with the shared migration code', async () => {
    const { owner } = await tenantWithOwner('Snilld', 'puja@gmail.com');
    const imported = await json(await call('POST', '/api/import', { cookie: owner, body: { document: v1Document() } }));
    expect(imported.status).toBe(200);
    expect(imported.body.counts).toMatchObject({ contacts: 2, companies: 1, deals: 1, activities: 1, tags: 1 });

    const snapshot = await json(await call('GET', '/api/data', { cookie: owner }));
    const byCollection = (name) => snapshot.body.records.filter((r) => r.collection === name).map((r) => r.data);
    const [company] = byCollection('companies');
    expect(company.name).toBe('Helios Bank');
    expect(byCollection('contacts').every((c) => c.companyId === company.id)).toBe(true);
    expect(byCollection('deals')[0].stakeholders).toEqual([{ contactId: 'c1', role: '' }]);
    expect(byCollection('activities')[0].status).toBe('done');
    expect(snapshot.body.settings.userName).toBe('Puja');

    const twice = await json(await call('POST', '/api/import', { cookie: owner, body: { document: v1Document() } }));
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('not_empty');
  });

  it('limits import and clear to owners and rejects files that are not NEXUS backups', async () => {
    const { owner } = await tenantWithOwner('Snilld', 'puja@gmail.com');
    const admin = await addMember(owner, 'ravi@gmail.com', 'admin');
    expect((await call('POST', '/api/import', { cookie: admin, body: { document: v1Document() } })).status).toBe(403);
    expect((await call('POST', '/api/clear', { cookie: admin })).status).toBe(403);
    expect((await json(await call('POST', '/api/import', { cookie: owner, body: { document: { hello: 'world' } } }))).body.error).toBe('bad_import');
  });

  it('clears to tombstones so other devices remove the records on their next pull, then allows a fresh import', async () => {
    const { owner } = await tenantWithOwner('Snilld', 'puja@gmail.com');
    await call('POST', '/api/import', { cookie: owner, body: { document: v1Document() } });
    const before = (await json(await call('GET', '/api/data', { cookie: owner }))).body.cursor;
    const cleared = await json(await call('POST', '/api/clear', { cookie: owner }));
    expect(cleared.body.removed).toBe(6);
    const delta = await json(await call('GET', `/api/data?since=${before}`, { cookie: owner }));
    expect(delta.body.records.every((r) => r.deleted)).toBe(true);
    expect(delta.body.settings.currency).toBe('₹');
    expect((await call('POST', '/api/import', { cookie: owner, body: { document: v1Document() } })).status).toBe(200);
  });
});
