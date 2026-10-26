import { beforeEach, describe, expect, it } from 'vitest';
import { resetGoogleKeyCache } from '../../server/google.js';
import { ROOT, addMember, call, google, json, signIn, tenantWithOwner } from './helpers.js';

beforeEach(() => {
  resetGoogleKeyCache();
  google.tokenFor = null;
});

describe('super admin tenants', () => {
  it('creates a tenant with a chosen tenant_id, a unique slug and a pending owner invitation', async () => {
    const root = await signIn(ROOT);
    const first = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'Snilld', id: 'tnt_snilld', ownerEmail: 'Puja@Gmail.com' } }));
    expect(first.status).toBe(201);
    expect(first.body.tenant).toMatchObject({ id: 'tnt_snilld', name: 'Snilld', slug: 'snilld', status: 'active' });
    expect(first.body.invitation).toMatchObject({ email: 'puja@gmail.com', role: 'owner' });

    const second = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'Snilld', ownerEmail: 'b@gmail.com' } }));
    expect(second.body.tenant.slug).toBe('snilld-2');
    expect(second.body.tenant.id).toMatch(/^tnt_[0-9a-f]{16}$/);

    const taken = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'X', id: 'tnt_snilld', ownerEmail: 'c@gmail.com' } }));
    expect(taken.status).toBe(409);
    const badId = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'X', id: 'Robert; DROP', ownerEmail: 'c@gmail.com' } }));
    expect(badId.body.error).toBe('bad_tenant_id');

    const list = await json(await call('GET', '/api/admin/tenants', { cookie: root }));
    const snilld = list.body.tenants.find((tenant) => tenant.id === 'tnt_snilld');
    expect(snilld).toMatchObject({ members: 0, pending: 1, pendingEmails: ['puja@gmail.com'], records: 0 });
  });

  it('is closed to everyone who is not listed in SUPER_ADMIN_EMAILS', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    expect((await call('GET', '/api/admin/tenants', { cookie: owner })).status).toBe(403);
    expect((await call('POST', '/api/admin/tenants', { cookie: owner, body: { name: 'Mine', ownerEmail: 'x@gmail.com' } })).status).toBe(403);
  });

  it('suspending a tenant locks its members out until it is reactivated', async () => {
    const { tenant, owner, root } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    await call('PATCH', `/api/admin/tenants/${tenant.id}`, { cookie: root, body: { status: 'suspended' } });
    expect((await call('GET', '/api/data', { cookie: owner })).status).toBe(403);
    expect((await json(await call('GET', '/api/me', { cookie: owner }))).body.tenant).toBeNull();
    await call('PATCH', `/api/admin/tenants/${tenant.id}`, { cookie: root, body: { status: 'active', name: 'Helios' } });
    const me = await json(await call('GET', '/api/me', { cookie: owner }));
    expect(me.body.tenant.name).toBe('Helios');
  });
});

describe('members and invitations', () => {
  it('lets an admin invite people, who join on their next sign-in or /api/me call', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const ravi = await signIn('ravi@gmail.com');
    expect((await json(await call('GET', '/api/me', { cookie: ravi }))).body.tenant).toBeNull();

    const invite = await json(await call('POST', '/api/invitations', { cookie: owner, body: { email: 'Ravi@gmail.com', role: 'admin' } }));
    expect(invite.status).toBe(201);
    const me = await json(await call('GET', '/api/me', { cookie: ravi }));
    expect(me.body.tenant).toMatchObject({ name: 'Helios Bank', role: 'admin' });

    const again = await json(await call('POST', '/api/invitations', { cookie: owner, body: { email: 'ravi@gmail.com' } }));
    expect(again.body.error).toBe('already_member');

    const list = await json(await call('GET', '/api/members', { cookie: owner }));
    expect(list.body.members.map((member) => [member.email, member.role, member.you])).toEqual([
      ['priya@gmail.com', 'owner', true],
      ['ravi@gmail.com', 'admin', false],
    ]);
  });

  it('enforces roles: members cannot invite, admins cannot touch owners, the last owner cannot leave', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const admin = await addMember(owner, 'ravi@gmail.com', 'admin');
    const member = await addMember(owner, 'meera@gmail.com', 'member');
    const ids = Object.fromEntries((await json(await call('GET', '/api/members', { cookie: owner }))).body.members.map((m) => [m.email, m.userId]));

    expect((await call('POST', '/api/invitations', { cookie: member, body: { email: 'x@gmail.com' } })).status).toBe(403);
    expect((await json(await call('GET', '/api/members', { cookie: member }))).body.invitations).toEqual([]);
    expect((await call('POST', '/api/invitations', { cookie: admin, body: { email: 'boss@gmail.com', role: 'owner' } })).status).toBe(403);
    expect((await call('PATCH', `/api/members/${ids['priya@gmail.com']}`, { cookie: admin, body: { role: 'member' } })).status).toBe(403);
    expect((await call('DELETE', `/api/members/${ids['priya@gmail.com']}`, { cookie: admin })).status).toBe(403);
    expect((await call('DELETE', `/api/members/${ids['ravi@gmail.com']}`, { cookie: member })).status).toBe(403);

    expect((await json(await call('PATCH', `/api/members/${ids['priya@gmail.com']}`, { cookie: owner, body: { role: 'admin' } }))).body.error).toBe('last_owner');
    expect((await json(await call('DELETE', `/api/members/${ids['priya@gmail.com']}`, { cookie: owner }))).body.error).toBe('last_owner');

    const promoted = await json(await call('PATCH', `/api/members/${ids['meera@gmail.com']}`, { cookie: admin, body: { role: 'admin' } }));
    expect(promoted.body.members.find((m) => m.email === 'meera@gmail.com').role).toBe('admin');

    expect((await call('DELETE', `/api/members/${ids['ravi@gmail.com']}`, { cookie: admin })).status).toBe(200);
    expect((await call('GET', '/api/data', { cookie: admin })).status).toBe(403);
  });

  it('lists and revokes pending invitations', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const created = await json(await call('POST', '/api/invitations', { cookie: owner, body: { email: 'kavya@gmail.com' } }));
    const list = await json(await call('GET', '/api/members', { cookie: owner }));
    expect(list.body.invitations.map((invite) => invite.email)).toEqual(['kavya@gmail.com']);
    const revoked = await json(await call('DELETE', `/api/invitations/${created.body.invitation.id}`, { cookie: owner }));
    expect(revoked.body.invitations).toEqual([]);
    const kavya = await signIn('kavya@gmail.com');
    expect((await json(await call('GET', '/api/me', { cookie: kavya }))).body.tenant).toBeNull();
  });

  it('renames the workspace for admins only', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const member = await addMember(owner, 'meera@gmail.com');
    expect((await call('PATCH', '/api/workspace', { cookie: member, body: { name: 'Mine' } })).status).toBe(403);
    const renamed = await json(await call('PATCH', '/api/workspace', { cookie: owner, body: { name: '  Helios   Bank Ltd ' } }));
    expect(renamed.body.tenant.name).toBe('Helios Bank Ltd');
  });
});

describe('several workspaces', () => {
  it('asks people in several workspaces to choose, and only lets them switch into their own', async () => {
    const helios = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const root = helios.root;
    const tata = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'Tata Digital', ownerEmail: 'priya@gmail.com' } }));
    const other = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name: 'Orbit Labs', ownerEmail: 'someone@gmail.com' } }));

    const priya = await signIn('priya@gmail.com');
    const me = await json(await call('GET', '/api/me', { cookie: priya }));
    expect(me.body.tenant).toBeNull();
    expect(me.body.memberships.map((m) => m.name)).toEqual(['Helios Bank', 'Tata Digital']);
    expect((await call('GET', '/api/data', { cookie: priya })).status).toBe(403);

    const switched = await json(await call('POST', '/api/session/tenant', { cookie: priya, body: { tenantId: tata.body.tenant.id } }));
    expect(switched.body.tenant.name).toBe('Tata Digital');
    const denied = await json(await call('POST', '/api/session/tenant', { cookie: priya, body: { tenantId: other.body.tenant.id } }));
    expect(denied.status).toBe(404);
    expect((await json(await call('GET', '/api/me', { cookie: priya }))).body.tenant.name).toBe('Tata Digital');
  });
});
