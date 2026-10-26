import { validateImport } from './validation.js';
import { plural } from './view-helpers.js';

export const LEGACY_KEY = 'nexus_scrm_data';
export const LEGACY_BACKUP_KEY = `${LEGACY_KEY}:backup:pre-tenant`;
export const ME_KEY = 'nexus:me';
const LATER_KEY = 'nexus:legacy-later';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEGACY_LABELS = [
  ['contacts', 'contact', 'contacts'],
  ['companies', 'company', 'companies'],
  ['deals', 'deal', 'deals'],
  ['activities', 'activity', 'activities'],
  ['customers', 'customer', 'customers'],
  ['orders', 'order', 'orders'],
];

/** Data the single-instance app left in this browser under its old storage key, if it has anything in it. */
export function readLegacy(storage) {
  const raw = storage.getItem(LEGACY_KEY);
  if (!raw) return null;
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!validateImport(doc).ok) return null;
  const present = LEGACY_LABELS.filter(([key]) => Array.isArray(doc[key]) && doc[key].length);
  if (!present.length) return null;
  return {
    raw,
    doc,
    counts: present.map(([key, , many]) => [many[0].toUpperCase() + many.slice(1), doc[key].length]),
    summary: present.slice(0, 3).map(([key, one, many]) => plural(doc[key].length, one, many)).join(', '),
  };
}

export function createCloud({
  api,
  sync,
  me,
  storage,
  session = typeof sessionStorage === 'undefined' ? null : sessionStorage,
  navigate = (url) => window.location.assign(url),
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard,
}) {
  const state = {
    me,
    status: sync.status(),
    accountOpen: false,
    busy: '',
    workspace: { loaded: false, loading: false, members: [], invitations: [], error: '' },
    drafts: { workspaceName: me.tenant.name, inviteEmail: '', inviteRole: 'member', inviteError: '' },
    legacy: readLegacy(storage),
  };
  let app = null;

  const role = () => state.me.tenant.role;
  const isOwner = () => role() === 'owner';
  const isAdmin = () => role() === 'owner' || role() === 'admin';

  function render() {
    app?.render();
  }

  function toast(tone, message, action) {
    app?.pushToast(tone, message, action);
  }

  function confirm(options) {
    app.ui.confirm = { tone: 'danger', ...options };
    render();
  }

  function setWorkspace(result) {
    state.workspace = { loaded: true, loading: false, members: result.members, invitations: result.invitations, error: '' };
  }

  async function loadWorkspace() {
    if (state.workspace.loading) return;
    state.workspace.loading = true;
    try {
      setWorkspace(await api.get('/api/members'));
    } catch (error) {
      state.workspace = { ...state.workspace, loading: false, error: error.status === 0 ? 'Your team list will load when you are back online.' : error.message };
    }
    render();
  }

  async function run(label, task) {
    state.busy = label;
    render();
    try {
      return await task();
    } catch (error) {
      toast('error', error.message || 'That did not work. Please try again.');
      return undefined;
    } finally {
      state.busy = '';
      render();
    }
  }

  async function invite() {
    const email = state.drafts.inviteEmail.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      state.drafts.inviteError = 'Enter the Gmail address they sign in with';
      render();
      return;
    }
    state.drafts.inviteError = '';
    const result = await run('invite', () => api.post('/api/invitations', { email, role: state.drafts.inviteRole }));
    if (!result) return;
    state.drafts.inviteEmail = '';
    await loadWorkspace();
    toast('success', `Invited ${email}. They can sign in with Google now.`);
  }

  async function renameWorkspace() {
    const name = state.drafts.workspaceName.trim();
    if (!name || name === state.me.tenant.name) return;
    const result = await run('rename', () => api.patch('/api/workspace', { name }));
    if (!result) return;
    state.me.tenant.name = result.tenant.name;
    state.drafts.workspaceName = result.tenant.name;
    state.me.memberships = state.me.memberships.map((item) => (item.tenantId === state.me.tenant.id ? { ...item, name: result.tenant.name } : item));
    storage.setItem(ME_KEY, JSON.stringify(state.me));
    toast('success', 'Workspace renamed');
  }

  function removeMember(userId) {
    const member = state.workspace.members.find((item) => item.userId === userId);
    if (!member) return;
    const self = member.you;
    confirm({
      title: self ? `Leave ${state.me.tenant.name}?` : `Remove ${member.name || member.email}?`,
      message: self
        ? 'You will lose access to this workspace on every device until someone invites you again.'
        : `${member.name || member.email} will lose access straight away. Their past activity stays in the Chronicle.`,
      yes: self ? 'Leave workspace' : 'Remove',
      onYes: async () => {
        app.ui.confirm = null;
        const result = await run('remove', () => api.del(`/api/members/${encodeURIComponent(userId)}`));
        if (!result) return;
        if (self) {
          await finishSignOut({ logout: false });
          return;
        }
        setWorkspace(result);
        toast('info', `${member.name || member.email} removed`);
      },
    });
  }

  async function changeRole(userId, nextRole) {
    const result = await run('role', () => api.patch(`/api/members/${encodeURIComponent(userId)}`, { role: nextRole }));
    if (result) {
      setWorkspace(result);
      toast('success', 'Role updated');
    }
  }

  async function finishSignOut({ logout = true } = {}) {
    sync.stop();
    if (logout) {
      try {
        await api.post('/auth/logout');
      } catch { /* offline: the session cookie still expires on its own */ }
    }
    sync.forget();
    storage.removeItem(ME_KEY);
    navigate('/');
  }

  async function signOut() {
    state.accountOpen = false;
    if (sync.pendingCount()) await sync.flush();
    if (sync.pendingCount()) {
      confirm({
        title: 'Sign out with unsynced changes?',
        message: `${plural(sync.pendingCount(), 'change')} on this device have not reached the server yet and will be lost.`,
        yes: 'Sign out anyway',
        onYes: () => finishSignOut(),
      });
      return;
    }
    await finishSignOut();
  }

  async function chooseWorkspace(tenantId) {
    if (tenantId === state.me.tenant.id) {
      app.ui.modal = null;
      render();
      return;
    }
    const result = await run('switch', () => api.post('/api/session/tenant', { tenantId }));
    if (!result) return;
    await sync.flush();
    storage.setItem(ME_KEY, JSON.stringify(result));
    navigate('/');
  }

  function archiveLegacy() {
    if (storage.getItem(LEGACY_BACKUP_KEY) == null) storage.setItem(LEGACY_BACKUP_KEY, state.legacy.raw);
    storage.removeItem(LEGACY_KEY);
    state.legacy = null;
  }

  async function importLegacy() {
    const legacy = state.legacy;
    if (!legacy || app.ui.modal?.busy) return;
    app.ui.modal = { ...app.ui.modal, busy: true, error: '' };
    render();
    try {
      await sync.importDocument(legacy.doc);
      archiveLegacy();
      app.ui.modal = null;
      toast('success', `Imported ${legacy.summary} into ${state.me.tenant.name}`);
    } catch (error) {
      app.ui.modal = { ...app.ui.modal, busy: false, error: error.code === 'not_empty' ? 'This workspace already has data, so the old copy was not imported. Download it from Settings instead.' : error.message };
    }
    render();
  }

  function downloadLegacy() {
    const legacy = state.legacy || (storage.getItem(LEGACY_BACKUP_KEY) ? { raw: storage.getItem(LEGACY_BACKUP_KEY) } : null);
    if (!legacy) return;
    const link = document.createElement('a');
    link.download = 'nexus-before-sign-in.json';
    if (typeof URL.createObjectURL === 'function') {
      link.href = URL.createObjectURL(new Blob([legacy.raw], { type: 'application/json' }));
      document.body.append(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 1000);
    }
    toast('success', 'Downloaded a copy of the old data');
  }

  const controller = {
    state,

    connect(hooks) {
      app = hooks;
      sync.subscribe((status) => {
        state.status = status;
        render();
      });
    },

    view() {
      const legacy = state.legacy ? { ...state.legacy, canImport: isOwner() && app?.store.recordCount() === 0 } : null;
      return {
        user: state.me.user,
        superAdmin: state.me.superAdmin,
        tenant: state.me.tenant,
        memberships: state.me.memberships,
        status: state.status,
        accountOpen: state.accountOpen,
        busy: state.busy,
        workspace: state.workspace,
        drafts: state.drafts,
        legacy,
        isOwner: isOwner(),
        isAdmin: isAdmin(),
        origin,
      };
    },

    firstName() {
      const { name, email } = state.me.user;
      return String(name || '').trim().split(/\s+/)[0] || String(email || '').split('@')[0] || 'there';
    },

    onRoute(view) {
      if (view === 'settings' && !state.workspace.loaded && !state.workspace.loading) loadWorkspace();
    },

    /** Offers the one-time import once the first pull shows the workspace is empty. */
    async offerLegacyImport() {
      const synced = await sync.ready;
      if (!synced || !state.legacy || !isOwner() || app.store.recordCount() > 0) return;
      if (session?.getItem(LATER_KEY) || app.ui.modal || app.ui.confirm) return;
      app.ui.modal = { type: 'legacy-import' };
      render();
    },

    handleAction(action, el) {
      switch (action) {
        case 'toggle-account':
          state.accountOpen = !state.accountOpen;
          render();
          return true;
        case 'close-account':
          state.accountOpen = false;
          return true;
        case 'switch-workspace':
          state.accountOpen = false;
          app.ui.modal = { type: 'workspaces' };
          render();
          return true;
        case 'choose-workspace':
          chooseWorkspace(el.dataset.tenantId);
          return true;
        case 'sign-out':
          signOut();
          return true;
        case 'sync-now':
          sync.pull().then(sync.flush);
          return true;
        case 'rename-workspace':
          renameWorkspace();
          return true;
        case 'copy-tenant-id':
          if (clipboard?.writeText) {
            clipboard.writeText(state.me.tenant.id).then(() => toast('success', 'Tenant ID copied'), () => toast('error', 'Could not copy'));
          }
          return true;
        case 'invite-member':
          invite();
          return true;
        case 'revoke-invite':
          run('revoke', () => api.del(`/api/invitations/${encodeURIComponent(el.dataset.inviteId)}`)).then((result) => {
            if (!result) return;
            setWorkspace(result);
            toast('info', 'Invitation revoked');
          });
          return true;
        case 'remove-member':
          removeMember(el.dataset.userId);
          return true;
        case 'legacy-open':
          app.ui.modal = { type: 'legacy-import' };
          render();
          return true;
        case 'legacy-later':
          session?.setItem(LATER_KEY, '1');
          app.ui.modal = null;
          render();
          return true;
        case 'legacy-import':
          importLegacy();
          return true;
        case 'legacy-download':
          downloadLegacy();
          return true;
        default:
          return false;
      }
    },

    handleInput(el) {
      const field = el.dataset.cloudField;
      if (!field) return false;
      state.drafts[field] = el.value;
      if (field === 'inviteEmail') state.drafts.inviteError = '';
      if (field === 'workspaceName') {
        const save = el.closest('.inline-form')?.querySelector('[data-action="rename-workspace"]');
        const unchanged = !el.value.trim() || el.value.trim() === state.me.tenant.name;
        if (save) save.setAttribute('aria-disabled', unchanged ? 'true' : 'false');
      }
      return true;
    },

    handleChange(el) {
      if (el.dataset.memberRole) {
        changeRole(el.dataset.memberRole, el.value);
        return true;
      }
      if (el.dataset.cloudField === 'inviteRole') {
        state.drafts.inviteRole = el.value;
        render();
        return true;
      }
      return Boolean(el.dataset.cloudField);
    },

    handleKey(event) {
      if (event.key !== 'Enter') return false;
      const field = event.target?.dataset?.cloudField;
      if (field === 'inviteEmail') invite();
      else if (field === 'workspaceName') renameWorkspace();
      else return false;
      event.preventDefault();
      return true;
    },

    closeMenus() {
      if (!state.accountOpen) return false;
      state.accountOpen = false;
      return true;
    },

    async importDocument(json) {
      const document = typeof json === 'string' ? JSON.parse(json) : json;
      return sync.importDocument(document);
    },

    clearAll: () => sync.clearAll(),

    async refresh() {
      await sync.flush();
      await sync.pull();
    },

    pushChanges: (ops, options) => sync.pushChanges(ops, options),
  };
  return controller;
}
