import { createApp } from './app.js';
import { createApi } from './api.js';
import { Store } from './store.js';
import { cacheKey, createSync } from './sync.js';
import { ME_KEY, createCloud } from './cloud.js';
import { mountAdmin } from './admin.js';
import { renderBootScreen } from './cloud-views.js';
import { plural } from './view-helpers.js';

function readCachedMe(storage) {
  try {
    return JSON.parse(storage.getItem(ME_KEY) || 'null');
  } catch {
    return null;
  }
}

/**
 * Starts the multi-tenant app: who is signed in, which workspace, then the normal NEXUS app
 * running on that tenant's local cache with sync to the server.
 */
export async function bootCloud({
  root,
  storage,
  clock,
  api = createApi(),
  location = window.location,
  history = window.history,
  navigate = (url) => window.location.assign(url),
  reload = () => window.location.reload(),
  createAppImpl = createApp,
}) {
  const params = new URLSearchParams(location.search);
  const authError = params.get('auth_error');
  if (authError) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  const adminPage = location.pathname.replace(/\/+$/, '') === '/admin';
  let busy = false;

  const paint = (kind, data) => {
    root.innerHTML = renderBootScreen(kind, data);
    root.querySelector('.google-btn, [data-boot-action="recheck"], .workspace-option')?.focus({ preventScroll: true });
  };

  async function signOut() {
    try {
      await api.post('/auth/logout');
    } catch { /* already signed out or offline */ }
    storage.removeItem(ME_KEY);
    reload();
  }

  function startWorkspace(me) {
    root.removeEventListener('click', onBootClick);
    const tenantId = me.tenant.id;
    let app = null;
    const sync = createSync({
      api,
      storage,
      tenantId,
      onRejected: (items) => app?.notify('error', items.length === 1
        ? `A change couldn't be saved: ${items[0].message}`
        : `${plural(items.length, 'change')} couldn't be saved`),
    });
    const store = new Store({ storage, clock, seed: false, storageKey: cacheKey(tenantId), recorder: sync.record });
    sync.attach(store);
    const cloud = createCloud({ api, sync, me, storage, navigate });
    root.innerHTML = '';
    app = createAppImpl({ root, storage, clock, seed: false, store, cloud });
    app.start();
    sync.start();
    document.title = `${me.tenant.name} · NEXUS`;
    return { kind: 'app', app, sync, cloud, store, me };
  }

  async function onBootClick(event) {
    const el = event.target.closest('[data-boot-action], [data-action="choose-workspace"]');
    if (!el || busy) return;
    const action = el.dataset.bootAction;
    if (action === 'google') return;
    event.preventDefault();
    if (action === 'recheck') reload();
    else if (action === 'signout') signOut();
    else if (el.dataset.action === 'choose-workspace') {
      busy = true;
      el.setAttribute('aria-busy', 'true');
      try {
        const me = await api.post('/api/session/tenant', { tenantId: el.dataset.tenantId });
        storage.setItem(ME_KEY, JSON.stringify(me));
        resolveResult(startWorkspace(me));
      } catch (error) {
        busy = false;
        paint('error', { message: error.message });
      }
    }
  }

  let resolveResult = () => {};
  root.addEventListener('click', onBootClick);
  paint('loading');

  let me;
  try {
    me = await api.get('/api/me');
    storage.setItem(ME_KEY, JSON.stringify(me));
  } catch (error) {
    if (error.status === 401) {
      storage.removeItem(ME_KEY);
      paint('signin', { error: authError, next: `${location.pathname}${location.hash}` });
      return { kind: 'signin' };
    }
    const cached = error.status === 0 ? readCachedMe(storage) : null;
    if (!cached?.tenant) {
      paint('error', { message: error.status === 0 ? "You're offline, and this device doesn't have a saved copy of your workspace yet. Connect once to sign in." : error.message });
      return { kind: 'error' };
    }
    me = cached;
  }

  if (adminPage) {
    if (!me.superAdmin) {
      navigate('/');
      return { kind: 'redirect' };
    }
    root.removeEventListener('click', onBootClick);
    return { kind: 'admin', admin: mountAdmin({ root, api, me, navigate }) };
  }
  if (me.tenant) return startWorkspace(me);
  if (me.memberships.length) {
    paint('picker', me);
    return new Promise((resolve) => { resolveResult = resolve; });
  }
  paint('no-workspace', me);
  return { kind: 'no-workspace' };
}
