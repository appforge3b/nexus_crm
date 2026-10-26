import { HttpError, json, readJson } from './http.js';
import { newId } from './crypto.js';
import { setSessionTenant } from './session.js';
import {
  COLLECTIONS,
  acceptInvitations,
  assertRole,
  createTenant,
  getTenant,
  listTenants,
  membershipsFor,
  slugTaken,
  tenantRepo,
  updateTenant,
} from './repo.js';
import { validateImport, validateRecord } from '../js/validation.js';
import { migrate, needsMigration } from '../js/migrate.js';
import { defaultSettings } from '../js/settings.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TENANT_ID = /^tnt_[a-z0-9][a-z0-9_-]{2,39}$/;
const MAX_OPS = 500;
const MAX_RECORD_BYTES = 256_000;
const RANK = { member: 0, admin: 1, owner: 2 };

function cleanName(value, label = 'Name') {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError(400, 'bad_name', `${label} is required`);
  if (name.length > 80) throw new HttpError(400, 'bad_name', `${label} must be 80 characters or fewer`);
  return name;
}

function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'bad_email', 'Enter a valid email address');
  return email;
}

export function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'workspace';
}

function tenantView(tenant, role) {
  return tenant ? { id: tenant.tenantId ?? tenant.id, name: tenant.name, slug: tenant.slug, role } : null;
}

/* ───────────── account ───────────── */

export async function me(ctx) {
  const { db, auth, now } = ctx;
  const accepted = await acceptInvitations(db, auth.user, now);
  let memberships = auth.memberships;
  if (accepted) {
    memberships = await membershipsFor(db, auth.user.id);
    if (!auth.tenantId && memberships.length === 1) {
      await setSessionTenant(db, auth.session.tokenHash, memberships[0].tenantId);
      auth.tenantId = memberships[0].tenantId;
      auth.role = memberships[0].role;
    }
  }
  const current = memberships.find((item) => item.tenantId === auth.tenantId) ?? null;
  return json({
    user: auth.user,
    superAdmin: auth.superAdmin,
    tenant: current ? tenantView(current, current.role) : null,
    memberships,
  });
}

export async function switchTenant(ctx) {
  const { tenantId } = await readJson(ctx.request);
  const target = ctx.auth.memberships.find((item) => item.tenantId === tenantId);
  if (!target) throw new HttpError(404, 'not_member', 'You are not a member of that workspace');
  await setSessionTenant(ctx.db, ctx.auth.session.tokenHash, target.tenantId);
  ctx.auth.tenantId = target.tenantId;
  ctx.auth.role = target.role;
  return me(ctx);
}

export async function renameWorkspace(ctx) {
  const { name } = await readJson(ctx.request);
  const tenant = await tenantRepo(ctx.db, ctx.auth.tenantId).rename(cleanName(name, 'Workspace name'));
  return json({ tenant: tenantView(tenant, ctx.auth.role) });
}

/* ───────────── members and invitations ───────────── */

export async function listMembers(ctx) {
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  const members = (await repo.members()).map((member) => ({ ...member, you: member.userId === ctx.auth.user.id }));
  const invitations = RANK[ctx.auth.role] >= RANK.admin ? await repo.invitations(ctx.now) : [];
  return json({ members, invitations });
}

export async function updateMember(ctx) {
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  const role = assertRole((await readJson(ctx.request)).role);
  const target = await repo.membership(ctx.params.userId);
  if (!target) throw new HttpError(404, 'not_found', 'That person is not in this workspace');
  if ((role === 'owner' || target.role === 'owner') && ctx.auth.role !== 'owner') {
    throw new HttpError(403, 'forbidden', 'Only an owner can change owners');
  }
  if (target.role === 'owner' && role !== 'owner' && (await repo.ownerCount()) <= 1) {
    throw new HttpError(409, 'last_owner', 'A workspace needs at least one owner');
  }
  await repo.setRole(ctx.params.userId, role);
  return listMembers(ctx);
}

export async function removeMember(ctx) {
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  const self = ctx.params.userId === ctx.auth.user.id;
  if (!self && RANK[ctx.auth.role] < RANK.admin) throw new HttpError(403, 'forbidden', 'Only admins can remove people');
  const target = await repo.membership(ctx.params.userId);
  if (!target) throw new HttpError(404, 'not_found', 'That person is not in this workspace');
  if (target.role === 'owner' && !self && ctx.auth.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can remove an owner');
  if (target.role === 'owner' && (await repo.ownerCount()) <= 1) throw new HttpError(409, 'last_owner', 'A workspace needs at least one owner');
  await repo.removeMember(ctx.params.userId);
  return listMembers(ctx);
}

export async function createInvitation(ctx) {
  const body = await readJson(ctx.request);
  const email = cleanEmail(body.email);
  const role = assertRole(body.role || 'member');
  if (role === 'owner' && ctx.auth.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can invite another owner');
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  if (await repo.isMemberEmail(email)) throw new HttpError(409, 'already_member', `${email} is already in this workspace`);
  const invitation = await repo.invite({ email, role, invitedBy: ctx.auth.user.id, now: ctx.now });
  return json({ invitation }, { status: 201 });
}

export async function revokeInvitation(ctx) {
  const removed = await tenantRepo(ctx.db, ctx.auth.tenantId).revokeInvitation(ctx.params.id);
  if (!removed) throw new HttpError(404, 'not_found', 'That invitation no longer exists');
  return listMembers(ctx);
}

/* ───────────── super admin: tenants ───────────── */

export async function adminListTenants(ctx) {
  return json({ tenants: await listTenants(ctx.db, ctx.now) });
}

export async function adminCreateTenant(ctx) {
  const body = await readJson(ctx.request);
  const name = cleanName(body.name, 'Company name');
  const ownerEmail = cleanEmail(body.ownerEmail);
  const id = body.id ? String(body.id).trim().toLowerCase() : newId('tnt');
  if (!TENANT_ID.test(id)) throw new HttpError(400, 'bad_tenant_id', 'Tenant ID must look like tnt_acme (lowercase letters, numbers, - or _)');
  if (await getTenant(ctx.db, id)) throw new HttpError(409, 'tenant_exists', `${id} is already taken`);
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await slugTaken(ctx.db, slug); n += 1) slug = `${base}-${n}`;
  const tenant = await createTenant(ctx.db, { id, name, slug, createdBy: ctx.auth.user.id, now: ctx.now });
  const invitation = await tenantRepo(ctx.db, id).invite({ email: ownerEmail, role: 'owner', invitedBy: ctx.auth.user.id, now: ctx.now });
  return json({ tenant, invitation }, { status: 201 });
}

export async function adminUpdateTenant(ctx) {
  const body = await readJson(ctx.request);
  if (!(await getTenant(ctx.db, ctx.params.id))) throw new HttpError(404, 'not_found', 'No such tenant');
  const changes = {};
  if (body.name !== undefined) changes.name = cleanName(body.name, 'Company name');
  if (body.status !== undefined) {
    if (!['active', 'suspended'].includes(body.status)) throw new HttpError(400, 'bad_status', 'Status must be active or suspended');
    changes.status = body.status;
  }
  return json({ tenant: await updateTenant(ctx.db, ctx.params.id, changes) });
}

export async function adminInvite(ctx) {
  const body = await readJson(ctx.request);
  if (!(await getTenant(ctx.db, ctx.params.id))) throw new HttpError(404, 'not_found', 'No such tenant');
  const invitation = await tenantRepo(ctx.db, ctx.params.id)
    .invite({ email: cleanEmail(body.email), role: assertRole(body.role || 'owner'), invitedBy: ctx.auth.user.id, now: ctx.now });
  return json({ invitation }, { status: 201 });
}

/* ───────────── data sync ───────────── */

export async function pull(ctx) {
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  const raw = ctx.url.searchParams.get('since');
  const since = raw == null || raw === '' ? null : Number(raw);
  if (since != null && (!Number.isInteger(since) || since < 0)) throw new HttpError(400, 'bad_cursor', 'since must be a cursor from an earlier response');
  if (since != null) {
    const delta = await repo.changesSince(since);
    if (since <= delta.cursor) return json({ mode: 'delta', ...delta });
  }
  return json({ mode: 'snapshot', ...(await repo.snapshot()) });
}

function checkOp(op) {
  if (!op || typeof op !== 'object') return 'Change is invalid';
  if (op.op === 'settings') {
    if (!op.data || typeof op.data !== 'object' || Array.isArray(op.data)) return 'Settings must be an object';
    return JSON.stringify(op.data).length > MAX_RECORD_BYTES ? 'Settings are too large' : null;
  }
  if (!COLLECTIONS.includes(op.collection)) return 'Unknown collection';
  if (typeof op.id !== 'string' || !op.id || op.id.length > 100) return 'Record id is invalid';
  if (op.op === 'delete') return null;
  if (op.op !== 'upsert') return 'Unknown change type';
  if (op.data?.id !== op.id) return 'Record id does not match';
  if (JSON.stringify(op.data).length > MAX_RECORD_BYTES) return 'Record is too large';
  const result = validateRecord(op.collection, op.data);
  return result.ok ? null : result.errors.map((error) => error.message).join(', ');
}

export async function push(ctx) {
  const body = await readJson(ctx.request, 8_000_000);
  if (!Array.isArray(body.ops)) throw new HttpError(400, 'bad_ops', 'ops must be an array');
  if (body.ops.length > MAX_OPS) throw new HttpError(413, 'too_many_ops', `Send at most ${MAX_OPS} changes at a time`);

  const rejected = [];
  const latest = new Map();
  let settings = null;
  for (const op of body.ops) {
    const problem = checkOp(op);
    if (problem) {
      rejected.push({ collection: op?.collection ?? null, id: op?.id ?? null, op: op?.op ?? null, message: problem });
      continue;
    }
    if (op.op === 'settings') settings = op.data;
    else latest.set(`${op.collection}/${op.id}`, op);
  }

  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  const current = await repo.versions([...latest.keys()]);
  const conflicts = [];
  for (const [key, op] of latest) {
    if (op.baseVersion != null && current.has(key) && current.get(key) !== op.baseVersion) {
      conflicts.push({ collection: op.collection, id: op.id });
    }
  }

  if (!latest.size && !settings) {
    return json({ cursor: await repo.cursor(), results: [], rejected, conflicts: [], settingsVersion: null });
  }
  const rows = [...latest.values()].map((op) => (op.op === 'delete'
    ? { c: op.collection, i: op.id, d: null, x: 1 }
    : { c: op.collection, i: op.id, d: JSON.stringify(op.data), x: 0 }));
  const outcome = await repo.write({ rows, settings, userId: ctx.auth.user.id, now: ctx.now });
  return json({
    cursor: outcome.cursor,
    results: outcome.written,
    rejected,
    conflicts,
    settingsVersion: settings ? outcome.settingsVersion : null,
  });
}

export async function importDocument(ctx) {
  const body = await readJson(ctx.request, 10_000_000);
  const document = body.document;
  if (!validateImport(document).ok) throw new HttpError(400, 'bad_import', 'That file is not a NEXUS backup');
  const repo = tenantRepo(ctx.db, ctx.auth.tenantId);
  if ((await repo.liveCount()) > 0) {
    throw new HttpError(409, 'not_empty', 'Import is only available while the workspace is empty. Clear the data first.');
  }
  const state = needsMigration(document) ? migrate(document, { now: ctx.now }) : document;
  const rows = [];
  const counts = {};
  for (const collection of COLLECTIONS) {
    counts[collection] = 0;
    for (const record of state[collection] || []) {
      if (!record || typeof record.id !== 'string' || !record.id) continue;
      rows.push({ c: collection, i: record.id, d: JSON.stringify(record), x: 0 });
      counts[collection] += 1;
    }
  }
  const settings = state.settings && typeof state.settings === 'object' ? state.settings : defaultSettings();
  const outcome = await repo.write({ rows, settings, userId: ctx.auth.user.id, now: ctx.now });
  return json({ cursor: outcome.cursor, counts });
}

export async function clearData(ctx) {
  const outcome = await tenantRepo(ctx.db, ctx.auth.tenantId).clear({ settings: defaultSettings(), userId: ctx.auth.user.id, now: ctx.now });
  return json(outcome);
}
