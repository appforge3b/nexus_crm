import { HttpError } from './http.js';
import { newId } from './crypto.js';

export const COLLECTIONS = ['contacts', 'companies', 'deals', 'activities', 'customers', 'orders', 'tags'];
export const ROLES = ['owner', 'admin', 'member'];
const INVITE_DAYS = 30;
const CHUNK_BYTES = 900_000;

const iso = (date) => date.toISOString();

function membershipRow(row) {
  return { tenantId: row.tenant_id, name: row.name, slug: row.slug, role: row.role };
}

/* ───────────── accounts: users, memberships, invitations, tenants (not tenant data) ───────────── */

export async function upsertGoogleUser(db, claims, now) {
  const email = String(claims.email).trim().toLowerCase();
  const name = String(claims.name || email.split('@')[0]).slice(0, 120);
  const picture = /^https:\/\//.test(claims.picture || '') ? String(claims.picture).slice(0, 500) : '';
  const existing = await db.prepare('SELECT id FROM users WHERE google_sub = ?1 OR email = ?2 ORDER BY google_sub = ?1 DESC LIMIT 1')
    .bind(claims.sub, email).first();
  if (existing) {
    await db.prepare('UPDATE users SET google_sub = ?2, email = ?3, name = ?4, picture = ?5, last_login_at = ?6 WHERE id = ?1')
      .bind(existing.id, claims.sub, email, name, picture, iso(now)).run();
    return { id: existing.id, email, name, picture };
  }
  const id = newId('usr');
  await db.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
    .bind(id, claims.sub, email, name, picture, iso(now)).run();
  return { id, email, name, picture };
}

/** Turns pending, unexpired invitations for this email into memberships. */
export async function acceptInvitations(db, user, now) {
  const { results } = await db.prepare(`
    SELECT i.id, i.tenant_id, i.role FROM invitations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.email = ?1 AND i.accepted_at IS NULL AND i.expires_at > ?2 AND t.status = 'active'`)
    .bind(user.email.toLowerCase(), iso(now)).all();
  if (!results.length) return 0;
  const statements = [];
  for (const invite of results) {
    statements.push(db.prepare(`INSERT INTO memberships (tenant_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (tenant_id, user_id) DO NOTHING`).bind(invite.tenant_id, user.id, invite.role, iso(now)));
    statements.push(db.prepare('UPDATE invitations SET accepted_at = ?2 WHERE id = ?1').bind(invite.id, iso(now)));
  }
  await db.batch(statements);
  return results.length;
}

export async function membershipsFor(db, userId) {
  const { results } = await db.prepare(`
    SELECT m.tenant_id, m.role, t.name, t.slug FROM memberships m JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ?1 AND t.status = 'active' ORDER BY t.name COLLATE NOCASE`).bind(userId).all();
  return results.map(membershipRow);
}

export async function createTenant(db, { id, name, slug, createdBy, now }) {
  await db.batch([
    db.prepare('INSERT INTO tenants (id, name, slug, status, seq, created_at, created_by) VALUES (?1, ?2, ?3, \'active\', 0, ?4, ?5)')
      .bind(id, name, slug, iso(now), createdBy),
  ]);
  return getTenant(db, id);
}

export async function getTenant(db, id) {
  return db.prepare('SELECT id, name, slug, status, created_at FROM tenants WHERE id = ?1').bind(id).first();
}

export async function slugTaken(db, slug) {
  return Boolean(await db.prepare('SELECT 1 FROM tenants WHERE slug = ?1').bind(slug).first());
}

export async function updateTenant(db, id, { name, status }) {
  await db.prepare('UPDATE tenants SET name = COALESCE(?2, name), status = COALESCE(?3, status) WHERE id = ?1')
    .bind(id, name ?? null, status ?? null).run();
  return getTenant(db, id);
}

export async function listTenants(db, now) {
  const { results } = await db.prepare(`
    SELECT t.id, t.name, t.slug, t.status, t.created_at,
      (SELECT COUNT(*) FROM memberships m WHERE m.tenant_id = t.id) AS members,
      (SELECT group_concat(u.email, ', ') FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = t.id AND m.role = 'owner') AS owners,
      (SELECT COUNT(*) FROM invitations i WHERE i.tenant_id = t.id AND i.accepted_at IS NULL AND i.expires_at > ?1) AS pending,
      (SELECT group_concat(i.email, ', ') FROM invitations i WHERE i.tenant_id = t.id AND i.accepted_at IS NULL AND i.expires_at > ?1) AS pending_emails,
      (SELECT COUNT(*) FROM records r WHERE r.tenant_id = t.id AND r.deleted = 0) AS records
    FROM tenants t ORDER BY t.created_at DESC`).bind(iso(now)).all();
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    members: row.members,
    owners: row.owners ? row.owners.split(', ') : [],
    pending: row.pending,
    pendingEmails: row.pending_emails ? row.pending_emails.split(', ') : [],
    records: row.records,
  }));
}

/* ───────────── tenant-scoped access: every query below is bound to one tenant ───────────── */

function chunkRows(rows) {
  const chunks = [];
  let current = [];
  let size = 2;
  for (const row of rows) {
    const length = JSON.stringify(row).length + 1;
    if (current.length && size + length > CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(row);
    size += length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const UPSERT_RECORDS = `
  INSERT INTO records (tenant_id, collection, id, data, version, seq, updated_at, updated_by, deleted)
  SELECT ?1, json_extract(j.value, '$.c'), json_extract(j.value, '$.i'), json_extract(j.value, '$.d'), 1,
    (SELECT seq FROM tenants WHERE id = ?1), ?2, ?3, json_extract(j.value, '$.x')
  FROM json_each(?4) AS j WHERE true
  ON CONFLICT (tenant_id, collection, id) DO UPDATE SET
    data = excluded.data, version = records.version + 1, seq = excluded.seq,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = excluded.deleted`;

const UPSERT_SETTINGS = `
  INSERT INTO tenant_settings (tenant_id, data, version, seq, updated_at)
  VALUES (?1, ?2, 1, (SELECT seq FROM tenants WHERE id = ?1), ?3)
  ON CONFLICT (tenant_id) DO UPDATE SET
    data = excluded.data, version = tenant_settings.version + 1, seq = excluded.seq, updated_at = excluded.updated_at`;

function parseRecord(row) {
  return {
    collection: row.collection,
    id: row.id,
    version: row.version,
    deleted: Boolean(row.deleted),
    data: row.deleted || row.data == null ? null : JSON.parse(row.data),
  };
}

export function tenantRepo(db, tenantId) {
  if (!tenantId || typeof tenantId !== 'string') throw new Error('tenantRepo requires a tenantId');

  async function cursor() {
    const row = await db.prepare('SELECT seq FROM tenants WHERE id = ?1').bind(tenantId).first();
    return row?.seq ?? 0;
  }

  return {
    tenantId,

    async rename(name) {
      await db.prepare('UPDATE tenants SET name = ?2 WHERE id = ?1').bind(tenantId, name).run();
      return getTenant(db, tenantId);
    },

    /* members and invitations */

    async membership(userId) {
      return db.prepare('SELECT role FROM memberships WHERE tenant_id = ?1 AND user_id = ?2').bind(tenantId, userId).first();
    },

    async members() {
      const { results } = await db.prepare(`
        SELECT u.id, u.email, u.name, u.picture, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ?1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name COLLATE NOCASE`)
        .bind(tenantId).all();
      return results.map((row) => ({ userId: row.id, email: row.email, name: row.name, picture: row.picture, role: row.role, joinedAt: row.created_at }));
    },

    async ownerCount() {
      const row = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ?1 AND role = 'owner'").bind(tenantId).first();
      return row.n;
    },

    async setRole(userId, role) {
      await db.prepare('UPDATE memberships SET role = ?3 WHERE tenant_id = ?1 AND user_id = ?2').bind(tenantId, userId, role).run();
    },

    async removeMember(userId) {
      await db.batch([
        db.prepare('DELETE FROM memberships WHERE tenant_id = ?1 AND user_id = ?2').bind(tenantId, userId),
        db.prepare('UPDATE sessions SET tenant_id = NULL WHERE tenant_id = ?1 AND user_id = ?2').bind(tenantId, userId),
      ]);
    },

    async isMemberEmail(email) {
      return Boolean(await db.prepare('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ?1 AND u.email = ?2')
        .bind(tenantId, email).first());
    },

    async invitations(now) {
      const { results } = await db.prepare(`
        SELECT i.id, i.email, i.role, i.created_at, i.expires_at, u.name AS invited_by
        FROM invitations i LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.tenant_id = ?1 AND i.accepted_at IS NULL AND i.expires_at > ?2 ORDER BY i.created_at DESC`)
        .bind(tenantId, iso(now)).all();
      return results.map((row) => ({ id: row.id, email: row.email, role: row.role, invitedBy: row.invited_by || '', createdAt: row.created_at, expiresAt: row.expires_at }));
    },

    async invite({ email, role, invitedBy, now }) {
      const id = newId('inv');
      const expires = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
      await db.batch([
        db.prepare('DELETE FROM invitations WHERE tenant_id = ?1 AND email = ?2 AND accepted_at IS NULL').bind(tenantId, email),
        db.prepare('INSERT INTO invitations (id, tenant_id, email, role, invited_by, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
          .bind(id, tenantId, email, role, invitedBy, iso(now), iso(expires)),
      ]);
      return { id, email, role, createdAt: iso(now), expiresAt: iso(expires) };
    },

    async revokeInvitation(id) {
      const result = await db.prepare('DELETE FROM invitations WHERE tenant_id = ?1 AND id = ?2 AND accepted_at IS NULL').bind(tenantId, id).run();
      return result.meta.changes > 0;
    },

    /* records and settings */

    cursor,

    async liveCount() {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM records WHERE tenant_id = ?1 AND deleted = 0').bind(tenantId).first();
      return row.n;
    },

    async snapshot() {
      const [seq, records, settings] = await db.batch([
        db.prepare('SELECT seq FROM tenants WHERE id = ?1').bind(tenantId),
        db.prepare('SELECT collection, id, data, version, deleted FROM records WHERE tenant_id = ?1 AND deleted = 0').bind(tenantId),
        db.prepare('SELECT data, version FROM tenant_settings WHERE tenant_id = ?1').bind(tenantId),
      ]);
      const settingsRow = settings.results[0];
      return {
        cursor: seq.results[0]?.seq ?? 0,
        records: records.results.map(parseRecord),
        settings: settingsRow ? JSON.parse(settingsRow.data) : null,
        settingsVersion: settingsRow?.version ?? 0,
      };
    },

    async changesSince(since) {
      const [seq, records, settings] = await db.batch([
        db.prepare('SELECT seq FROM tenants WHERE id = ?1').bind(tenantId),
        db.prepare('SELECT collection, id, data, version, deleted FROM records WHERE tenant_id = ?1 AND seq > ?2 ORDER BY seq').bind(tenantId, since),
        db.prepare('SELECT data, version FROM tenant_settings WHERE tenant_id = ?1 AND seq > ?2').bind(tenantId, since),
      ]);
      const settingsRow = settings.results[0];
      return {
        cursor: seq.results[0]?.seq ?? 0,
        records: records.results.map(parseRecord),
        settings: settingsRow ? JSON.parse(settingsRow.data) : null,
        settingsVersion: settingsRow?.version ?? 0,
      };
    },

    async versions(keys) {
      if (!keys.length) return new Map();
      const { results } = await db.prepare(`
        SELECT collection, id, version FROM records
        WHERE tenant_id = ?1 AND (collection || '/' || id) IN (SELECT value FROM json_each(?2))`)
        .bind(tenantId, JSON.stringify(keys)).all();
      return new Map(results.map((row) => [`${row.collection}/${row.id}`, row.version]));
    },

    /**
     * Applies upserts, deletes and a settings write as one D1 batch (a single transaction),
     * stamping every row with the same new tenant seq.
     */
    async write({ rows = [], settings = null, userId, now }) {
      const statements = [db.prepare('UPDATE tenants SET seq = seq + 1 WHERE id = ?1').bind(tenantId)];
      for (const chunk of chunkRows(rows)) {
        statements.push(db.prepare(UPSERT_RECORDS).bind(tenantId, iso(now), userId, JSON.stringify(chunk)));
      }
      if (settings) statements.push(db.prepare(UPSERT_SETTINGS).bind(tenantId, JSON.stringify(settings), iso(now)));
      statements.push(db.prepare(`SELECT collection, id, version, deleted FROM records
        WHERE tenant_id = ?1 AND seq = (SELECT seq FROM tenants WHERE id = ?1)`).bind(tenantId));
      statements.push(db.prepare('SELECT seq FROM tenants WHERE id = ?1').bind(tenantId));
      statements.push(db.prepare('SELECT version FROM tenant_settings WHERE tenant_id = ?1').bind(tenantId));
      const results = await db.batch(statements);
      const [written, seq, settingsVersion] = results.slice(-3);
      return {
        cursor: seq.results[0].seq,
        written: written.results.map((row) => ({ collection: row.collection, id: row.id, version: row.version, deleted: Boolean(row.deleted) })),
        settingsVersion: settingsVersion.results[0]?.version ?? 0,
      };
    },

    async clear({ settings, userId, now }) {
      const results = await db.batch([
        db.prepare('UPDATE tenants SET seq = seq + 1 WHERE id = ?1').bind(tenantId),
        db.prepare(`UPDATE records SET data = NULL, deleted = 1, version = version + 1,
          seq = (SELECT seq FROM tenants WHERE id = ?1), updated_at = ?2, updated_by = ?3
          WHERE tenant_id = ?1 AND deleted = 0`).bind(tenantId, iso(now), userId),
        db.prepare(UPSERT_SETTINGS).bind(tenantId, JSON.stringify(settings), iso(now)),
        db.prepare('SELECT seq FROM tenants WHERE id = ?1').bind(tenantId),
      ]);
      return { cursor: results[3].results[0].seq, removed: results[1].meta.changes };
    },
  };
}

export function assertRole(role) {
  if (!ROLES.includes(role)) throw new HttpError(400, 'bad_role', 'Role must be owner, admin or member');
  return role;
}
