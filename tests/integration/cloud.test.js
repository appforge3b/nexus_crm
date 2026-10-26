import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootCloud } from '../../js/boot.js';
import { ApiError } from '../../js/api.js';
import { LEGACY_BACKUP_KEY, LEGACY_KEY, ME_KEY } from '../../js/cloud.js';
import { cacheKey } from '../../js/sync.js';
import { fakeServer, settle } from '../helpers/fake-server.js';
import { click, navigate, setValue } from '../helpers/mount.js';

const clock = { now: () => new Date(2026, 9, 21, 9, 0, 0, 0) };
const SNILLD = { tenantId: 'tnt_snilld', name: 'Snilld', slug: 'snilld', role: 'owner' };

function meFor({ role = 'owner', tenant = true, memberships = [{ ...SNILLD, role }], superAdmin = false } = {}) {
  return {
    user: { id: 'usr_puja', email: 'puja@snilld.test', name: 'Puja Rao', picture: null },
    superAdmin,
    tenant: tenant ? { id: SNILLD.tenantId, name: SNILLD.name, slug: SNILLD.slug, role } : null,
    memberships,
  };
}

let booted = null;

async function boot(server, { path = '/', search = '', hash = '', keepStorage = false } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  if (!keepStorage) localStorage.clear();
  window.location.hash = hash;
  const navigateTo = vi.fn();
  const reload = vi.fn();
  const result = await bootCloud({
    root: document.getElementById('app'),
    storage: localStorage,
    clock,
    api: server.api,
    location: { pathname: path, search, hash },
    history: { replaceState: vi.fn() },
    navigate: navigateTo,
    reload,
  });
  booted = result;
  await settle();
  await settle();
  return { ...result, navigateTo, reload };
}

const text = () => document.body.textContent.replace(/\s+/g, ' ');

afterEach(() => {
  booted?.sync?.stop();
  booted = null;
});

describe('cloud boot screens', () => {
  it('shows Google sign-in when signed out, with a friendly message after a cancelled sign-in', async () => {
    const server = fakeServer();
    server.failWith = new ApiError(401, 'unauthenticated', 'Please sign in');
    await boot(server, { search: '?auth_error=cancelled', hash: '#/pipeline' });
    const google = document.querySelector('.google-btn');
    expect(google.getAttribute('href')).toBe('/auth/login?next=%2F%23%2Fpipeline');
    expect(document.querySelector('[data-boot="signin"] [role="alert"]')).not.toBeNull();
    expect(document.querySelector('[data-sidebar]')).toBeNull();
  });

  it('tells a signed-in user without a workspace to ask for an invite, and offers admin to super admins', async () => {
    const server = fakeServer({ me: meFor({ tenant: false, memberships: [], superAdmin: true }) });
    const { reload } = await boot(server);
    expect(document.querySelector('[data-boot="no-workspace"]')).not.toBeNull();
    expect(text()).toContain('Ask your NEXUS admin to invite puja@snilld.test');
    expect(document.querySelector('a[href="/admin"]')).not.toBeNull();
    click('[data-boot-action="recheck"]');
    expect(reload).toHaveBeenCalled();
  });

  it('lets someone in several workspaces pick one, then opens the app on that tenant', async () => {
    const helios = { tenantId: 'tnt_helios', name: 'Helios Bank', slug: 'helios', role: 'member' };
    const server = fakeServer({ me: meFor({ tenant: false, memberships: [SNILLD, helios] }) });
    server.seed('contacts', { id: 'c1', name: 'Kavya Menon', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
    server.routes = {
      'POST /api/session/tenant': ({ tenantId }) => ({ ...meFor({ role: 'member', memberships: [SNILLD, helios] }), tenant: { id: tenantId, name: 'Helios Bank', slug: 'helios', role: 'member' } }),
    };
    const pending = boot(server);
    await settle();
    expect(document.querySelectorAll('[data-boot="picker"] .workspace-option')).toHaveLength(2);
    click('[data-tenant-id="tnt_helios"]');
    const result = await pending;
    expect(result.kind).toBe('app');
    await result.sync.ready;
    expect(result.store.getAll('contacts').map((c) => c.name)).toEqual(['Kavya Menon']);
    expect(localStorage.getItem(cacheKey('tnt_helios'))).not.toBeNull();
    expect(document.querySelector('.account-text strong').textContent).toBe('Helios Bank');
  });

  it('opens the cached workspace when offline, and explains when there is nothing cached yet', async () => {
    const server = fakeServer({ me: meFor() });
    server.offline = true;
    await boot(server);
    expect(document.querySelector('[data-boot="error"]')).not.toBeNull();
    expect(text()).toContain("You're offline");

    localStorage.setItem(ME_KEY, JSON.stringify(meFor()));
    const result = await boot(server, { keepStorage: true });
    expect(result.kind).toBe('app');
    await result.sync.ready;
    expect(document.querySelector('[data-sync-banner]').hidden).toBe(false);
    expect(document.querySelector('.sync-banner').textContent).toContain('Offline.');
  });

  it('sends people who are not super admins away from /admin', async () => {
    const server = fakeServer({ me: meFor() });
    const { navigateTo } = await boot(server, { path: '/admin' });
    expect(navigateTo).toHaveBeenCalledWith('/');

    const root = fakeServer({ me: meFor({ tenant: false, memberships: [], superAdmin: true }) });
    root.routes = { 'GET /api/admin/tenants': () => ({ tenants: [] }) };
    const result = await boot(root, { path: '/admin' });
    expect(result.kind).toBe('admin');
    expect(document.querySelector('.admin-page')).not.toBeNull();
  });
});

describe('the cloud app', () => {
  it('greets with the Google first name and shows the workspace and sync state in the account menu', async () => {
    const server = fakeServer({ me: meFor() });
    await boot(server);
    expect(document.querySelector('[data-view="briefing"] h1').textContent).toContain('Puja');
    click('[data-action="toggle-account"]');
    const menu = document.querySelector('[data-account-menu] .account-menu');
    expect(menu.textContent).toContain('puja@snilld.test');
    expect(menu.textContent).toContain('Snilld');
    expect(menu.textContent).toContain('All changes saved');
    click('[data-view]');
    expect(document.querySelector('[data-account-menu] .account-menu')).toBeNull();
  });

  it('pushes edits to the server and re-renders when a teammate changes something', async () => {
    const server = fakeServer({ me: meFor() });
    const { sync } = await boot(server, { hash: '#/roster' });
    server.seed('contacts', { id: 'c9', name: 'Meera Nair', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
    await sync.pull();
    await settle();
    expect(text()).toContain('Meera Nair');
  });

  it('lists the team in Settings and invites a teammate by Gmail address', async () => {
    const server = fakeServer({ me: meFor() });
    let invitations = [];
    server.routes = {
      'GET /api/members': () => ({
        members: [{ userId: 'usr_puja', email: 'puja@snilld.test', name: 'Puja Rao', role: 'owner', you: true }],
        invitations,
      }),
      'POST /api/invitations': ({ email, role }) => {
        invitations = [{ id: 'inv_1', email, role, createdAt: '2026-10-21T08:00:00.000Z', invitedBy: 'Puja Rao' }];
        return { invitation: invitations[0] };
      },
    };
    await boot(server, { hash: '#/settings' });
    navigate('#/settings');
    await settle();
    await settle();
    expect(document.querySelector('[data-region="team"]').textContent).toContain('Puja Rao');
    expect(document.querySelector('[data-member="usr_puja"] [data-action="remove-member"]')).toBeNull();
    expect(document.querySelector('[data-field="userName"]')).toBeNull();

    setValue(document.querySelector('[data-cloud-field="inviteEmail"]'), 'not-an-email');
    click('[data-action="invite-member"]');
    expect(document.querySelector('[data-region="team"] .field-error').textContent).toContain('Gmail address');

    setValue(document.querySelector('[data-cloud-field="inviteEmail"]'), 'Ravi@Snilld.test');
    click('[data-action="invite-member"]');
    await settle();
    await settle();
    expect(server.calls.find((call) => call.path === '/api/invitations').body).toEqual({ email: 'ravi@snilld.test', role: 'member' });
    expect(document.querySelector('.member-list.pending').textContent).toContain('ravi@snilld.test');
  });

  it('hides owner-only data tools from members', async () => {
    const server = fakeServer({ me: meFor({ role: 'member' }) });
    server.routes = { 'GET /api/members': () => ({ members: [], invitations: [] }) };
    await boot(server, { hash: '#/settings' });
    navigate('#/settings');
    expect(document.querySelector('[data-region="data"] [data-action="export"]')).not.toBeNull();
    expect(document.querySelector('[data-region="team"]')).not.toBeNull();
    expect(document.querySelector('[data-action="clear-all"]')).toBeNull();
    expect(document.querySelector('[data-field="import"]')).toBeNull();
    expect(document.querySelector('[data-action="reset-demo"]')).toBeNull();
    expect(document.querySelector('[data-action="invite-member"]')).toBeNull();
  });
});

describe('absorbing data saved before sign-in', () => {
  const legacyDoc = () => ({
    version: 3,
    contacts: [{ id: 'c1', name: 'Ananya Iyer', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
    companies: [],
    deals: [{ id: 'd1', title: 'Store analytics', value: 420000, stage: 'proposal', contactId: 'c1', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
    activities: [],
    customers: [],
    orders: [],
    tags: [],
    settings: { currency: '₹' },
  });

  async function bootWithLegacy(server) {
    localStorage.clear();
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyDoc()));
    const result = await boot(server, { keepStorage: true });
    await result.sync.ready;
    await settle();
    return result;
  }

  it('offers the owner a one-time import into an empty workspace, then archives the old copy', async () => {
    const server = fakeServer({ me: meFor() });
    const { store } = await bootWithLegacy(server);
    const dialog = document.querySelector('.legacy-modal');
    expect(dialog.textContent).toContain('Bring your existing data into Snilld');
    expect(dialog.textContent).toMatch(/1\s*Contacts/);

    click('[data-action="legacy-import"]');
    await settle();
    await settle();
    await settle();
    expect(server.live('contacts').map((c) => c.name)).toEqual(['Ananya Iyer']);
    expect(server.live('deals')).toHaveLength(1);
    expect(store.getAll('contacts')).toHaveLength(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LEGACY_BACKUP_KEY)).contacts[0].name).toBe('Ananya Iyer');
    expect(document.querySelector('.legacy-modal')).toBeNull();
  });

  it('does not prompt when the workspace already has data, or for members', async () => {
    const busy = fakeServer({ me: meFor() });
    busy.seed('contacts', { id: 'x1', name: 'Existing', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
    await bootWithLegacy(busy);
    expect(document.querySelector('.legacy-modal')).toBeNull();
    booted.sync.stop();

    const member = fakeServer({ me: meFor({ role: 'member' }) });
    member.routes = { 'GET /api/members': () => ({ members: [], invitations: [] }) };
    await bootWithLegacy(member);
    expect(document.querySelector('.legacy-modal')).toBeNull();
    navigate('#/settings');
    const tip = document.querySelector('.legacy-tip');
    expect(tip.textContent).toContain('send the file to your workspace owner');
    expect(tip.querySelector('[data-action="legacy-open"]')).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});
