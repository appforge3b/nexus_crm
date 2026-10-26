import { avatarGradient, formatRelativeTime, initials } from './format.js';
import { esc, icon } from './markup.js';
import { brandMark, plural } from './view-helpers.js';
import { personAvatar } from './cloud-views.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TENANT_ID = /^tnt_[a-z0-9][a-z0-9_-]{2,39}$/;

export function suggestTenantId(name) {
  const base = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  return base ? `tnt_${base}` : '';
}

function stat(value, label) {
  return `<span class="tenant-stat"><strong>${value}</strong>${esc(label)}</span>`;
}

/** Super-admin console for creating and managing tenants. Lives at /admin, outside any workspace. */
export function mountAdmin({ root, api, me, navigate = (url) => window.location.assign(url), now = () => new Date() }) {
  const state = {
    tenants: [],
    loaded: false,
    error: '',
    drafts: { name: '', id: '', ownerEmail: '' },
    idTouched: false,
    createError: '',
    busy: '',
    inviteFor: null,
    inviteEmail: '',
    renameFor: null,
    renameValue: '',
    confirmSuspend: null,
    notice: null,
  };
  let noticeTimer = 0;

  function notice(tone, message) {
    clearTimeout(noticeTimer);
    state.notice = { tone, message };
    noticeTimer = setTimeout(() => {
      state.notice = null;
      paint();
    }, 5000);
  }

  function tenantRow(tenant) {
    const suspended = tenant.status === 'suspended';
    const inviting = state.inviteFor === tenant.id;
    const renaming = state.renameFor === tenant.id;
    const confirming = state.confirmSuspend === tenant.id;
    return `<li class="tenant-row glass" data-tenant="${esc(tenant.id)}" data-status="${esc(tenant.status)}">
      <div class="tenant-head">
        <span class="workspace-mark" style="background:${avatarGradient(tenant.name)}">${esc(initials(tenant.name))}</span>
        <div class="tenant-title">
          ${renaming
            ? `<span class="inline-form"><input data-admin-field="renameValue" value="${esc(state.renameValue)}" aria-label="New name for ${esc(tenant.name)}" maxlength="80">
               <button type="button" class="btn primary small" data-admin-action="save-rename" data-id="${esc(tenant.id)}">Save</button>
               <button type="button" class="btn ghost small" data-admin-action="cancel">Cancel</button></span>`
            : `<strong>${esc(tenant.name)}</strong>`}
          <span class="tenant-meta"><code class="tenant-id">${esc(tenant.id)}</code><span class="muted small">Created ${esc(formatRelativeTime(tenant.createdAt, now()))}</span></span>
        </div>
        <span class="pill status" data-status="${esc(tenant.status)}">${suspended ? 'Suspended' : 'Active'}</span>
      </div>
      <div class="tenant-stats">
        ${stat(tenant.members, tenant.members === 1 ? 'member' : 'members')}
        ${stat(tenant.records, tenant.records === 1 ? 'record' : 'records')}
        ${stat(tenant.pending, 'pending')}
      </div>
      <p class="tenant-people small">${tenant.owners.length ? `${icon('shield', 12)}<span>Owner${tenant.owners.length > 1 ? 's' : ''}: ${esc(tenant.owners.join(', '))}</span>` : `${icon('clock', 12)}<span class="muted">No owner has signed in yet</span>`}
        ${tenant.pendingEmails.length ? `<span class="muted">· Invited: ${esc(tenant.pendingEmails.join(', '))}</span>` : ''}</p>
      ${inviting ? `<div class="invite-form">
          <input type="email" data-admin-field="inviteEmail" value="${esc(state.inviteEmail)}" placeholder="owner@gmail.com" aria-label="Owner email for ${esc(tenant.name)}">
          <button type="button" class="btn primary small" data-admin-action="send-invite" data-id="${esc(tenant.id)}">Invite owner</button>
          <button type="button" class="btn ghost small" data-admin-action="cancel">Cancel</button>
        </div>` : ''}
      ${confirming ? `<p class="inline-warning" role="alert">${icon('warning', 14)}<span>Suspend ${esc(tenant.name)}? Everyone in it loses access until you reactivate it. No data is deleted.</span>
          <button type="button" class="btn danger small" data-admin-action="confirm-suspend" data-id="${esc(tenant.id)}">Suspend</button>
          <button type="button" class="btn ghost small" data-admin-action="cancel">Keep active</button></p>` : ''}
      <div class="tenant-actions">
        <button type="button" class="btn ghost small" data-admin-action="invite" data-id="${esc(tenant.id)}">${icon('user-plus', 14)}Invite owner</button>
        <button type="button" class="btn ghost small" data-admin-action="rename" data-id="${esc(tenant.id)}">${icon('edit', 14)}Rename</button>
        ${suspended
          ? `<button type="button" class="btn ghost small" data-admin-action="activate" data-id="${esc(tenant.id)}">${icon('refresh', 14)}Reactivate</button>`
          : `<button type="button" class="btn danger-ghost small" data-admin-action="suspend" data-id="${esc(tenant.id)}">Suspend</button>`}
      </div>
    </li>`;
  }

  function render() {
    const { drafts } = state;
    const list = !state.loaded
      ? `<p class="muted" role="status">${esc(state.error || 'Loading tenants…')}</p>`
      : state.tenants.length
        ? `<ul class="tenant-list">${state.tenants.map(tenantRow).join('')}</ul>`
        : `<div class="empty-state"><p><strong>No tenants yet.</strong></p><p class="muted small">Create the first company workspace on the left.</p></div>`;
    return `
      <div class="ambient" aria-hidden="true"></div>
      <div class="admin-page">
        <header class="admin-top glass">
          <a class="boot-brand" href="/">${brandMark()}<span class="wordmark">NEXUS</span></a>
          <span class="admin-crumb">${icon('shield', 14)}Administration</span>
          <span class="admin-spacer"></span>
          ${me.memberships.length ? `<a class="btn ghost small" href="/">${icon('briefing', 14)}<span>Open workspace</span></a>` : ''}
          <span class="admin-user">${personAvatar(me.user, 'sm')}<span class="admin-user-text">${esc(me.user.email)}</span></span>
          <button type="button" class="icon-btn" data-admin-action="sign-out" aria-label="Sign out" title="Sign out">${icon('logout', 16)}</button>
        </header>
        <main class="admin-main">
          <header class="view-header"><div><p class="eyebrow">Tenants</p><h1>Company workspaces</h1><p class="muted">Each tenant is one company with its own private data, identified by its tenant ID.</p></div>
            ${state.loaded ? `<span class="count-pill">${plural(state.tenants.length, 'tenant')}</span>` : ''}</header>
          <div class="admin-grid">
            <section class="panel glass admin-create" aria-labelledby="create-title">
              <header class="panel-head"><h2 id="create-title">New tenant</h2></header>
              <label class="field"><span>Company name</span><input data-admin-field="name" value="${esc(drafts.name)}" placeholder="e.g. Helios Bank" maxlength="80" autocomplete="off"></label>
              <label class="field"><span>Tenant ID</span><input data-admin-field="id" value="${esc(drafts.id)}" placeholder="tnt_helios_bank" spellcheck="false" autocomplete="off"><em class="muted small">Permanent. Lowercase letters, numbers, - or _. Leave blank to generate one.</em></label>
              <label class="field"><span>Owner's Gmail</span><input type="email" data-admin-field="ownerEmail" value="${esc(drafts.ownerEmail)}" placeholder="owner@gmail.com" autocomplete="off"><em class="muted small">They become the owner the first time they sign in with Google.</em></label>
              ${state.createError ? `<p class="field-error" role="alert">${esc(state.createError)}</p>` : ''}
              <button type="button" class="btn primary block" data-admin-action="create" ${state.busy === 'create' ? 'aria-disabled="true"' : ''}>${icon('plus', 16)}${state.busy === 'create' ? 'Creating…' : 'Create tenant'}</button>
            </section>
            <section class="admin-tenants" aria-label="Tenants">${list}</section>
          </div>
        </main>
        ${state.notice ? `<div class="toasts admin-toasts" aria-live="polite"><div class="toast" role="status" data-tone="${state.notice.tone}"><span class="toast-msg">${esc(state.notice.message)}</span></div></div>` : ''}
      </div>`;
  }

  function paint() {
    const active = document.activeElement?.dataset?.adminField;
    root.innerHTML = render();
    if (active) {
      const el = root.querySelector(`[data-admin-field="${active}"]`);
      el?.focus();
      if (el && typeof el.setSelectionRange === 'function' && el.type !== 'email') el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  async function load() {
    try {
      state.tenants = (await api.get('/api/admin/tenants')).tenants;
      state.loaded = true;
      state.error = '';
    } catch (error) {
      state.error = error.message;
    }
    paint();
  }

  async function act(label, task, success) {
    state.busy = label;
    paint();
    try {
      await task();
      if (success) notice('success', success);
      await load();
      return true;
    } catch (error) {
      notice('error', error.message);
      return false;
    } finally {
      state.busy = '';
      paint();
    }
  }

  async function create() {
    const name = state.drafts.name.trim();
    const id = state.drafts.id.trim().toLowerCase();
    const ownerEmail = state.drafts.ownerEmail.trim().toLowerCase();
    state.createError = !name ? 'Company name is required'
      : id && !TENANT_ID.test(id) ? 'Tenant ID must start with tnt_ and use lowercase letters, numbers, - or _'
        : !EMAIL.test(ownerEmail) ? "Enter the owner's Gmail address" : '';
    if (state.createError) {
      paint();
      return;
    }
    state.busy = 'create';
    paint();
    try {
      const result = await api.post('/api/admin/tenants', { name, id: id || undefined, ownerEmail });
      state.drafts = { name: '', id: '', ownerEmail: '' };
      state.idTouched = false;
      notice('success', `${result.tenant.name} created as ${result.tenant.id}. ${ownerEmail} can sign in now.`);
      await load();
    } catch (error) {
      state.createError = error.message;
    } finally {
      state.busy = '';
      paint();
    }
  }

  function cancel() {
    state.inviteFor = null;
    state.renameFor = null;
    state.confirmSuspend = null;
  }

  function onClick(event) {
    const el = event.target.closest('[data-admin-action]');
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    const id = el.dataset.id;
    const tenant = state.tenants.find((item) => item.id === id);
    switch (el.dataset.adminAction) {
      case 'create': create(); break;
      case 'invite':
        cancel();
        state.inviteFor = id;
        state.inviteEmail = '';
        paint();
        root.querySelector('[data-admin-field="inviteEmail"]')?.focus();
        break;
      case 'send-invite': {
        const email = state.inviteEmail.trim().toLowerCase();
        if (!EMAIL.test(email)) {
          notice('error', 'Enter a valid Gmail address');
          paint();
          break;
        }
        act('invite', () => api.post(`/api/admin/tenants/${encodeURIComponent(id)}/invitations`, { email, role: 'owner' }), `${email} invited as owner of ${tenant?.name}`)
          .then((ok) => { if (ok) cancel(); paint(); });
        break;
      }
      case 'rename':
        cancel();
        state.renameFor = id;
        state.renameValue = tenant?.name || '';
        paint();
        root.querySelector('[data-admin-field="renameValue"]')?.focus();
        break;
      case 'save-rename':
        act('rename', () => api.patch(`/api/admin/tenants/${encodeURIComponent(id)}`, { name: state.renameValue }), 'Tenant renamed')
          .then((ok) => { if (ok) cancel(); paint(); });
        break;
      case 'suspend':
        cancel();
        state.confirmSuspend = id;
        paint();
        break;
      case 'confirm-suspend':
        cancel();
        act('status', () => api.patch(`/api/admin/tenants/${encodeURIComponent(id)}`, { status: 'suspended' }), `${tenant?.name} suspended`);
        break;
      case 'activate':
        act('status', () => api.patch(`/api/admin/tenants/${encodeURIComponent(id)}`, { status: 'active' }), `${tenant?.name} is active again`);
        break;
      case 'cancel':
        cancel();
        paint();
        break;
      case 'sign-out':
        api.post('/auth/logout').catch(() => {}).finally(() => navigate('/'));
        break;
      default:
    }
  }

  function onInput(event) {
    const field = event.target.dataset?.adminField;
    if (!field) return;
    if (field in state.drafts) {
      state.drafts[field] = event.target.value;
      if (field === 'id') state.idTouched = Boolean(event.target.value);
      if (field === 'name' && !state.idTouched) {
        state.drafts.id = suggestTenantId(event.target.value);
        const idInput = root.querySelector('[data-admin-field="id"]');
        if (idInput) idInput.value = state.drafts.id;
      }
      if (state.createError) {
        state.createError = '';
        root.querySelector('.admin-create .field-error')?.remove();
      }
    } else {
      state[field] = event.target.value;
    }
  }

  function onKey(event) {
    if (event.key !== 'Enter') return;
    const field = event.target.dataset?.adminField;
    if (!field) return;
    event.preventDefault();
    if (field === 'inviteEmail') root.querySelector('[data-admin-action="send-invite"]')?.click();
    else if (field === 'renameValue') root.querySelector('[data-admin-action="save-rename"]')?.click();
    else create();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKey);
  document.title = 'Administration · NEXUS';
  paint();
  load();
  return {
    state,
    stop() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('keydown', onKey);
    },
  };
}
