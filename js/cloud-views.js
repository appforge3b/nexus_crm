import { avatarGradient, formatRelativeTime, initials } from './format.js';
import { esc, icon } from './markup.js';
import { brandMark, excelBlock, plural } from './view-helpers.js';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_HELP = {
  owner: 'Everything, including import, clearing data and managing owners',
  admin: 'Manage the team and invitations',
  member: 'Work with contacts, deals and the Chronicle',
};

const AUTH_ERRORS = {
  cancelled: 'Sign-in was cancelled. Try again whenever you are ready.',
  expired: 'That sign-in took too long or was opened in another tab. Please try again.',
  invalid: 'Google sign-in could not be verified. Please try again.',
  unverified: 'Your Google email address is not verified yet. Verify it with Google, then try again.',
  google_error: 'Google sign-in is unavailable right now. Please try again in a minute.',
};

const GOOGLE_G = `<svg class="google-g" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

export function authErrorMessage(code) {
  return code ? AUTH_ERRORS[code] || AUTH_ERRORS.invalid : '';
}

export function personAvatar(person, size = '') {
  const name = person?.name || person?.email || '?';
  if (person?.picture) {
    return `<span class="avatar photo ${size}" style="background:${avatarGradient(name)}"><img src="${esc(person.picture)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`;
  }
  return `<span class="avatar ${size}" style="background:${avatarGradient(name)}">${esc(initials(name))}</span>`;
}

function workspaceMark(name) {
  return `<span class="workspace-mark" style="background:${avatarGradient(name)}">${esc(initials(name))}</span>`;
}

export function workspaceList(memberships, currentId = null, action = 'choose-workspace') {
  return `<ul class="workspace-list">${memberships.map((item) => `
    <li><button type="button" class="workspace-option" data-action="${action}" data-tenant-id="${esc(item.tenantId)}" ${item.tenantId === currentId ? 'aria-current="true"' : ''}>
      ${workspaceMark(item.name)}
      <span class="workspace-option-main"><strong>${esc(item.name)}</strong><span class="muted small">${esc(ROLE_LABEL[item.role] || item.role)}</span></span>
      ${item.tenantId === currentId ? `<span class="pill current">${icon('check', 12)}Current</span>` : icon('chevron', 16)}
    </button></li>`).join('')}
  </ul>`;
}

/* ───────────── full-page screens shown before the app opens ───────────── */

function bootFrame(kind, body, foot = '') {
  return `
    <div class="ambient" aria-hidden="true"></div>
    <main class="boot" data-boot="${kind}">
      <section class="boot-card glass" aria-labelledby="boot-title">
        <div class="boot-brand">${brandMark()}<span class="wordmark">NEXUS</span></div>
        ${body}
      </section>
      ${foot ? `<p class="boot-foot">${foot}</p>` : ''}
    </main>`;
}

export function renderBootScreen(kind, data = {}) {
  if (kind === 'loading') {
    return bootFrame('loading', `<div class="boot-loading" role="status"><span class="boot-spinner" aria-hidden="true"></span><span id="boot-title">${esc(data.message || 'Opening your workspace…')}</span></div>`);
  }
  if (kind === 'signin') {
    const error = authErrorMessage(data.error);
    const next = encodeURIComponent(data.next || '/');
    return bootFrame('signin', `
      <h1 id="boot-title">Sign in to your workspace</h1>
      <p class="boot-lede">Your sales cockpit, shared with your team. Use the Google account your workspace invited.</p>
      ${error ? `<p class="inline-warning" role="alert">${icon('warning', 14)}<span>${esc(error)}</span></p>` : ''}
      <a class="google-btn" href="/auth/login?next=${next}" data-boot-action="google">${GOOGLE_G}<span>Continue with Google</span></a>
      <ul class="boot-points">
        <li>${icon('roster', 14)}<span>One shared pipeline for your whole team</span></li>
        <li>${icon('cloud', 14)}<span>Saved securely and synced across your devices</span></li>
        <li>${icon('bolt', 14)}<span>Keeps working when your signal drops</span></li>
      </ul>`,
    'Just looking around? <a href="https://crm.snilld.in">Open the demo</a>, no sign-in needed.');
  }
  if (kind === 'no-workspace') {
    const { user, superAdmin } = data;
    return bootFrame('no-workspace', `
      <div class="boot-user">${personAvatar(user, 'lg')}<span><strong>${esc(user.name || user.email)}</strong><span class="muted small">${esc(user.email)}</span></span></div>
      <h1 id="boot-title">You're not in a workspace yet</h1>
      <p class="boot-lede">Ask your NEXUS admin to invite <strong>${esc(user.email)}</strong>. As soon as they do, you're in.</p>
      <div class="boot-actions">
        <button type="button" class="btn primary" data-boot-action="recheck">${icon('refresh', 16)}Check again</button>
        ${superAdmin ? `<a class="btn ghost" href="/admin">${icon('shield', 16)}Administration</a>` : ''}
        <button type="button" class="btn ghost" data-boot-action="signout">${icon('logout', 16)}Use another account</button>
      </div>`);
  }
  if (kind === 'picker') {
    const { user, memberships, superAdmin } = data;
    return bootFrame('picker', `
      <div class="boot-user">${personAvatar(user, 'lg')}<span><strong>${esc(user.name || user.email)}</strong><span class="muted small">${esc(user.email)}</span></span></div>
      <h1 id="boot-title">Choose a workspace</h1>
      <p class="boot-lede">You're a member of ${plural(memberships.length, 'workspace')}.</p>
      ${workspaceList(memberships, null)}
      <div class="boot-actions">
        ${superAdmin ? `<a class="btn ghost small" href="/admin">${icon('shield', 14)}Administration</a>` : ''}
        <button type="button" class="btn ghost small" data-boot-action="signout">${icon('logout', 14)}Sign out</button>
      </div>`);
  }
  return bootFrame('error', `
    <h1 id="boot-title">NEXUS couldn't open</h1>
    <p class="boot-lede">${esc(data.message || 'Something went wrong while loading your workspace.')}</p>
    <div class="boot-actions"><button type="button" class="btn primary" data-boot-action="recheck">${icon('refresh', 16)}Try again</button></div>`);
}

/* ───────────── inside the app ───────────── */

const SYNC_LABEL = {
  idle: 'Connecting…',
  syncing: 'Syncing…',
  online: 'All changes saved',
  offline: 'Offline',
  error: 'Sync problem',
  'signed-out': 'Signed out',
  'no-access': 'No access',
};

export function syncLabel(status) {
  if (status.pending && status.state !== 'offline') return `Saving ${plural(status.pending, 'change')}…`;
  if (status.state === 'offline' && status.pending) return `Offline · ${plural(status.pending, 'change')} waiting`;
  return SYNC_LABEL[status.state] || '';
}

function syncTone(status) {
  if (['error', 'signed-out', 'no-access'].includes(status.state)) return 'danger';
  if (status.state === 'offline') return 'muted';
  if (status.pending || status.state === 'syncing' || status.state === 'idle') return 'busy';
  return 'ok';
}

export function renderAccount(cloud) {
  const { user, tenant, status, accountOpen } = cloud;
  const tone = syncTone(status);
  return `
    <button type="button" class="account-btn" data-action="toggle-account" aria-expanded="${accountOpen ? 'true' : 'false'}" aria-haspopup="menu" title="${esc(`${user.email} · ${tenant.name} · ${syncLabel(status)}`)}">
      <span class="account-avatar">${personAvatar(user, 'sm')}<i class="sync-dot" data-tone="${tone}"></i></span>
      <span class="account-text"><strong>${esc(tenant.name)}</strong><span>${esc(user.name || user.email)}</span></span>
    </button>`;
}

export function renderAccountMenu(cloud) {
  const { user, tenant, status, accountOpen, memberships, superAdmin } = cloud;
  if (!accountOpen) return '';
  const tone = syncTone(status);
  return `<div class="account-menu glass" role="menu" aria-label="Account">
      <div class="account-menu-head">
        ${personAvatar(user)}
        <span><strong>${esc(user.name || user.email)}</strong><span class="muted small">${esc(user.email)}</span></span>
      </div>
      <div class="account-menu-workspace">${workspaceMark(tenant.name)}<span><strong>${esc(tenant.name)}</strong><span class="muted small">${esc(ROLE_LABEL[tenant.role])} · <span data-tone="${tone}" class="sync-text">${esc(syncLabel(status))}</span></span></span></div>
      ${memberships.length > 1 ? `<button type="button" role="menuitem" class="menu-item" data-action="switch-workspace">${icon('swap', 16)}Switch workspace</button>` : ''}
      <a role="menuitem" class="menu-item" href="#/settings" data-action="close-account">${icon('roster', 16)}Team &amp; workspace</a>
      ${superAdmin ? `<a role="menuitem" class="menu-item" href="/admin">${icon('shield', 16)}Administration</a>` : ''}
      <button type="button" role="menuitem" class="menu-item danger" data-action="sign-out">${icon('logout', 16)}Sign out</button>
    </div>`;
}

export function renderSyncBanner(status) {
  const pending = status.pending ? ` ${plural(status.pending, 'change')} will sync when you reconnect.` : ' Changes you make will sync when you reconnect.';
  switch (status.state) {
    case 'offline':
      return `<div class="sync-banner" data-tone="muted" role="status">${icon('cloud-off', 16)}<span><strong>Offline.</strong>${esc(pending)}</span></div>`;
    case 'signed-out':
      return `<div class="sync-banner" data-tone="danger" role="alert">${icon('warning', 16)}<span><strong>Your session has ended.</strong> Sign in again to keep syncing${status.pending ? ` ${plural(status.pending, 'saved change')}` : ''}.</span><a class="btn small primary" href="/auth/login?next=${encodeURIComponent(`/${window.location.hash}`)}">Sign in</a></div>`;
    case 'no-access':
      return `<div class="sync-banner" data-tone="danger" role="alert">${icon('warning', 16)}<span><strong>You no longer have access to this workspace.</strong> Ask an admin to invite you again.</span><button type="button" class="btn small ghost" data-action="sign-out">Sign out</button></div>`;
    case 'error':
      return `<div class="sync-banner" data-tone="warning" role="status">${icon('warning', 16)}<span><strong>Couldn't sync.</strong> ${esc(status.error || '')} Retrying shortly.</span><button type="button" class="btn small ghost" data-action="sync-now">Retry now</button></div>`;
    default:
      return '';
  }
}

function memberRow(member, cloud, soleOwner) {
  const { isAdmin, isOwner } = cloud;
  const canEdit = isAdmin && (isOwner || member.role !== 'owner') && !member.you;
  const roles = isOwner ? ['owner', 'admin', 'member'] : ['admin', 'member'];
  const role = canEdit
    ? `<select class="role-select" data-member-role="${esc(member.userId)}" aria-label="Role for ${esc(member.name || member.email)}">${roles.map((id) => `<option value="${id}" ${member.role === id ? 'selected' : ''}>${ROLE_LABEL[id]}</option>`).join('')}</select>`
    : `<span class="pill role" data-role="${esc(member.role)}">${esc(ROLE_LABEL[member.role])}</span>`;
  const removable = !(soleOwner && member.role === 'owner') && (member.you || (isAdmin && (isOwner || member.role !== 'owner')));
  const remove = removable
    ? `<button type="button" class="icon-btn tiny danger" data-action="remove-member" data-user-id="${esc(member.userId)}" aria-label="${member.you ? 'Leave this workspace' : `Remove ${esc(member.name || member.email)}`}" title="${member.you ? 'Leave workspace' : 'Remove from workspace'}">${icon(member.you ? 'logout' : 'trash', 14)}</button>`
    : '';
  return `<li class="member-row" data-member="${esc(member.userId)}">
    ${personAvatar(member, 'sm')}
    <span class="member-main"><strong>${esc(member.name || member.email)}${member.you ? ' <span class="muted small">(you)</span>' : ''}</strong><span class="muted small">${esc(member.email)}</span></span>
    <span class="member-role">${role}</span>
    <span class="member-tools">${remove}</span>
  </li>`;
}

export function renderWorkspacePanels(ctx) {
  const cloud = ctx.cloud;
  const { tenant, workspace, drafts, isAdmin, isOwner, user, memberships, busy } = cloud;
  const inviteRoles = isOwner ? ['member', 'admin', 'owner'] : ['member', 'admin'];
  const soleOwner = workspace.members.filter((member) => member.role === 'owner').length === 1;
  const members = workspace.loaded
    ? `<ul class="member-list">${workspace.members.map((member) => memberRow(member, cloud, soleOwner)).join('')}</ul>`
    : `<p class="muted small" role="status">${workspace.error ? esc(workspace.error) : 'Loading your team…'}</p>`;
  return `
    <section class="panel glass stagger" data-region="workspace">
      <header class="panel-head"><h2>Workspace</h2><span class="pill role" data-role="${esc(tenant.role)}">${esc(ROLE_LABEL[tenant.role])}</span></header>
      <div class="workspace-hero">${workspaceMark(tenant.name)}<div><strong>${esc(tenant.name)}</strong><span class="muted small">Shared by everyone on the team below</span></div></div>
      ${isAdmin ? `<label class="field"><span>Workspace name</span>
        <span class="inline-form"><input data-cloud-field="workspaceName" value="${esc(drafts.workspaceName)}" maxlength="80" aria-label="Workspace name">
        <button type="button" class="btn ghost small" data-action="rename-workspace" ${drafts.workspaceName.trim() === tenant.name || !drafts.workspaceName.trim() ? 'aria-disabled="true"' : ''}>Save</button></span></label>` : ''}
      <div class="field"><span>Tenant ID</span><span class="inline-form"><code class="tenant-id">${esc(tenant.id)}</code><button type="button" class="icon-btn tiny" data-action="copy-tenant-id" aria-label="Copy tenant ID" title="Copy">${icon('copy', 14)}</button></span></div>
    </section>
    <section class="panel glass stagger" data-region="account">
      <header class="panel-head"><h2>Your account</h2></header>
      <div class="workspace-hero">${personAvatar(user, 'lg')}<div><strong>${esc(user.name || user.email)}</strong><span class="muted small">${esc(user.email)} · Google</span></div></div>
      <div class="data-actions">
        ${memberships.length > 1 ? `<button type="button" class="btn ghost" data-action="switch-workspace">${icon('swap', 16)}Switch workspace</button>` : ''}
        <button type="button" class="btn ghost" data-action="sign-out">${icon('logout', 16)}Sign out</button>
      </div>
      <p class="muted small">Signing out also removes this workspace's copy from this device.</p>
    </section>
    <section class="panel glass stagger settings-wide" data-region="team">
      <header class="panel-head"><h2>Team</h2>${workspace.loaded ? `<span class="count-pill">${workspace.members.length}</span>` : ''}</header>
      ${members}
      ${isAdmin ? `
        <div class="invite-box">
          <span class="invite-title">${icon('user-plus', 16)}Invite by Gmail address</span>
          <div class="invite-form">
            <input type="email" data-cloud-field="inviteEmail" value="${esc(drafts.inviteEmail)}" placeholder="name@gmail.com" aria-label="Email to invite" autocomplete="off">
            <select data-cloud-field="inviteRole" aria-label="Role for the invitation">${inviteRoles.map((id) => `<option value="${id}" ${drafts.inviteRole === id ? 'selected' : ''}>${ROLE_LABEL[id]}</option>`).join('')}</select>
            <button type="button" class="btn primary small" data-action="invite-member" ${busy === 'invite' ? 'aria-disabled="true"' : ''}>${busy === 'invite' ? 'Inviting…' : 'Invite'}</button>
          </div>
          ${drafts.inviteError ? `<p class="field-error" role="alert">${esc(drafts.inviteError)}</p>` : `<p class="muted small">${esc(ROLE_HELP[drafts.inviteRole] || '')}. They sign in with Google at <strong>${esc(cloud.origin.replace(/^https?:\/\//, ''))}</strong> using that address.</p>`}
        </div>
        ${workspace.invitations.length ? `<h3 class="subhead">Waiting to join <span class="count-pill">${workspace.invitations.length}</span></h3>
        <ul class="member-list pending">${workspace.invitations.map((invite) => `
          <li class="member-row">
            <span class="avatar sm pending-avatar">${icon('email', 14)}</span>
            <span class="member-main"><strong>${esc(invite.email)}</strong><span class="muted small">Invited ${esc(formatRelativeTime(invite.createdAt, ctx.now))}${invite.invitedBy ? ` by ${esc(invite.invitedBy)}` : ''}</span></span>
            <span class="member-role"><span class="pill role" data-role="${esc(invite.role)}">${esc(ROLE_LABEL[invite.role])}</span></span>
            <span class="member-tools"><button type="button" class="text-link danger" data-action="revoke-invite" data-invite-id="${esc(invite.id)}">Revoke</button></span>
          </li>`).join('')}</ul>` : ''}` : ''}
    </section>`;
}

export function renderCloudDataPanel(ctx, counts, hasRecords) {
  const cloud = ctx.cloud;
  const { status, isOwner, isAdmin, tenant, legacy } = cloud;
  const synced = status.lastSyncedAt ? `Last synced ${formatRelativeTime(status.lastSyncedAt, ctx.now)}` : 'Not synced yet';
  return `
    <section class="panel glass stagger" data-region="data">
      <header class="panel-head"><h2>Data Management</h2></header>
      <p class="muted small">${esc(counts)} in <strong>${esc(tenant.name)}</strong>.</p>
      <p class="sync-line" data-tone="${status.pending ? 'busy' : 'ok'}">${icon('cloud', 14)}<span>${esc(syncLabel(status))} · ${esc(synced)}</span></p>
      <div class="data-actions">
        <button type="button" class="btn ghost" data-action="export">${icon('download', 16)}Export All Data</button>
        ${isOwner ? `<label class="btn ghost file-btn">${icon('upload', 16)}Import Data<input type="file" data-field="import" accept="application/json,.json"></label>
        <button type="button" class="btn danger-ghost" data-action="clear-all">${icon('trash', 16)}Clear All Data</button>` : ''}
      </div>
      <p class="muted small">${isOwner ? 'A JSON backup can be imported while the workspace is empty, so it never mixes with live data.' : 'Only workspace owners can restore a backup or clear data.'}</p>
      ${excelBlock({ canImport: isAdmin, hasRecords, importNote: isAdmin ? '' : 'Only owners and admins can import from Excel.' })}
      ${legacy ? `<div class="inline-tip legacy-tip">${icon('warning', 14)}<span>This browser still holds data from before sign-in (${esc(legacy.summary)}).${isOwner ? '' : ' Download it and send the file to your workspace owner.'}</span>
        <span class="legacy-actions"><button type="button" class="text-link" data-action="legacy-download">Download a copy</button>${legacy.canImport ? '<button type="button" class="text-link" data-action="legacy-open">Import it</button>' : ''}</span></div>` : ''}
    </section>`;
}

export function renderCloudOverlay(ctx) {
  const { ui, cloud } = ctx;
  if (ui.modal?.type === 'workspaces') {
    return `
      <div data-overlay class="overlay">
        <div role="dialog" class="modal sheet compact" aria-modal="true" aria-labelledby="ws-title">
          <header class="modal-head"><span class="modal-icon">${icon('swap')}</span><h2 id="ws-title">Switch workspace</h2><button type="button" class="icon-btn" data-action="cancel-modal" aria-label="Close">${icon('close')}</button></header>
          <div class="modal-body">${workspaceList(cloud.memberships, cloud.tenant.id)}</div>
        </div>
      </div>`;
  }
  if (ui.modal?.type === 'legacy-import') {
    const legacy = cloud.legacy;
    return `
      <div data-overlay class="overlay">
        <div role="dialog" class="modal legacy-modal" aria-modal="true" aria-labelledby="legacy-title">
          <header class="modal-head"><span class="modal-icon">${icon('upload')}</span><h2 id="legacy-title">Bring your existing data into ${esc(cloud.tenant.name)}</h2><button type="button" class="icon-btn" data-action="legacy-later" aria-label="Close">${icon('close')}</button></header>
          <div class="modal-body">
            <p>We found NEXUS data saved in this browser from before sign-in was added.</p>
            <ul class="legacy-counts">${legacy.counts.map(([label, count]) => `<li><strong>${count}</strong><span>${esc(label)}</span></li>`).join('')}</ul>
            <p class="muted small">Importing makes it available to your whole team on every device. The original stays on this device as a backup.</p>
            ${ui.modal.error ? `<p class="inline-warning" role="alert">${icon('warning', 14)}<span>${esc(ui.modal.error)}</span></p>` : ''}
          </div>
          <footer class="modal-actions">
            <button type="button" class="btn ghost" data-action="legacy-later">Not now</button>
            <button type="button" class="btn primary" data-action="legacy-import" ${ui.modal.busy ? 'aria-disabled="true"' : ''}>${ui.modal.busy ? 'Importing…' : 'Import into workspace'}</button>
          </footer>
        </div>
      </div>`;
  }
  return '';
}
