import { Store } from './store.js';
import { parseRoute } from './router.js';
import { shortcutAction } from './keyboard.js';
import { debounce } from './debounce.js';
import { renderOverlay, renderShell, renderView } from './views.js';
import { moveDeal, confirmConversion, STAGE_PROBABILITY } from './deals.js';
import { renameStage, stageLabel } from './settings.js';
import {
  validateActivity,
  validateContact,
  validateDeal,
  validateImport,
  validateOrder,
  validateTag,
} from './validation.js';
import {
  backwardMoveMessage,
  deleteContactMessage,
  deleteDealMessage,
  importPreviewText,
} from './copy.js';
import { exportFilename, formatMoney, formatMoneyCompact } from './format.js';
import { icon } from './icons.js';
import { esc } from './markup.js';
import { DRAWERS, hideTooltip, mountChart } from './chart-render.js';
import { burst, countUp, startParticleField } from './fx.js';

const ANIMATE = typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent || '');
const TOAST_ICON = { success: 'bolt', error: 'warning', info: 'chronicle' };
const cssValue = (value) => String(value).replace(/["\\]/g, '\\$&');
const FOCUS_ATTRS = ['data-field', 'data-stage-id', 'data-tag-name', 'data-tag-color', 'data-move-stage', 'data-picker-for'];

let stopPrevious = () => {};

function emptyFilters() {
  return { search: '', minValue: '', maxValue: '', priorities: [], createdFrom: '', createdTo: '' };
}

export function createApp({ root, storage, clock, seed = false, storageKey = 'nexus_data', demoMode = seed }) {
  const store = new Store({ storage, clock, seed, storageKey });
  const ui = {
    collapsed: false,
    menuOpen: false,
    modal: null,
    confirm: null,
    help: false,
    celebrate: false,
    toasts: [],
    showLost: false,
    demoMode,
    filters: emptyFilters(),
    rosterQuery: '',
    rosterDraft: '',
    rosterStatus: 'all',
    customerQuery: '',
    chronicleType: 'all',
    chronicleLimit: 20,
    chronicleFrom: '',
    chronicleTo: '',
    radarRange: 'this-month',
    radarFrom: '',
    radarTo: '',
    radarCustomOpen: false,
    customerTab: 'orders',
    selectedCustomerId: null,
    tagError: '',
    importJson: '',
    mobileStage: 'prospect',
  };

  let painted = false;
  let alive = true;
  let timelineObserver = null;
  let revealObserver = null;
  let stopParticles = () => {};
  let lastOverlay = '';
  let lastPanelKey = '';
  let lastFocusBeforeModal = null;
  let pendingBurst = null;
  let suppressClick = false;
  let drag = null;
  let touch = null;
  const counts = new Map();
  const chartSigs = new Map();
  const revealed = new Set();

  const applyRoster = debounce((value) => {
    ui.rosterQuery = value;
    render();
  }, 300);

  const saveNotes = debounce((id, value) => {
    if (!id) return;
    store.update('customers', id, { notes: value });
  }, 300);

  function now() {
    return clock?.now ? clock.now() : new Date();
  }

  function currency() {
    return store.getSettings().currency || '₹';
  }

  function context() {
    const customers = store.getAll('customers');
    if (!customers.some((customer) => customer.id === ui.selectedCustomerId)) {
      ui.selectedCustomerId = customers[0]?.id ?? null;
    }
    return {
      route: parseRoute(window.location.hash),
      now: now(),
      settings: store.getSettings(),
      contacts: store.getAll('contacts'),
      deals: store.getAll('deals'),
      activities: store.getAll('activities'),
      customers,
      orders: store.getAll('orders'),
      tags: store.getAll('tags'),
      ui,
    };
  }

  /* ───────────── rendering ───────────── */

  function render() {
    if (!alive || !root) return;
    const ctx = context();
    const focus = captureFocus();
    if (!painted) {
      root.innerHTML = renderShell();
      painted = true;
      if (ANIMATE) {
        root.classList.add('motion');
        stopParticles = startParticleField(root.querySelector('[data-particle-field]'));
      }
    }
    updateShell(ctx);
    const viewChanged = renderMain(ctx);
    renderOverlayLayer(ctx);
    syncToasts();
    root.querySelector('.fx-layer')?.toggleAttribute('data-celebration', Boolean(ui.celebrate));
    restoreFocus(focus);
    bindSentinel();
    enhance(viewChanged);
  }

  function updateShell(ctx) {
    const sidebar = root.querySelector('[data-sidebar]');
    const shell = root.querySelector('.shell');
    sidebar.dataset.collapsed = ui.collapsed ? 'true' : 'false';
    sidebar.dataset.open = ui.menuOpen ? 'true' : 'false';
    shell.dataset.collapsed = ui.collapsed ? 'true' : 'false';
    root.classList.toggle('menu-open', ui.menuOpen);
    for (const nav of root.querySelectorAll('[data-sidebar], [data-bottom-nav]')) {
      nav.querySelectorAll('a[href]').forEach((link) => {
        const id = link.getAttribute('href').replace(/^#\//, '').split('?')[0];
        if (id === ctx.route.view) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
  }

  function currentView() {
    return root.querySelector('.workspace > [data-view]');
  }

  function renderMain(ctx) {
    const workspace = root.querySelector('.workspace');
    const template = document.createElement('template');
    template.innerHTML = renderView(ctx).trim();
    const next = template.content.firstElementChild;
    const current = currentView();
    const changed = !current || current.dataset.view !== ctx.route.view;
    const oldPanel = current?.querySelector('[data-panel]');
    const ghost = ANIMATE && oldPanel ? oldPanel.cloneNode(true) : null;

    let section;
    if (!changed) {
      const scroll = captureScroll(current);
      current.replaceChildren(...next.childNodes);
      restoreScroll(current, scroll);
      section = current;
    } else {
      if (current && ANIMATE) leaveView(current, workspace);
      else current?.remove();
      next.classList.add('view-enter');
      workspace.append(next);
      section = next;
      revealed.clear();
      if (ANIMATE) {
        window.scrollTo(0, 0);
        next.querySelectorAll('.stagger').forEach((el, index) => el.style.setProperty('--s', Math.min(index, 8)));
        setTimeout(() => next.classList.remove('view-enter'), 1100);
      }
    }

    const panel = section.querySelector('[data-panel]');
    const key = panel?.dataset.panelKey || '';
    if (panel && key !== lastPanelKey) panel.classList.add('drawer-enter');
    if (ghost && !key && !changed) {
      ghost.removeAttribute('data-panel');
      ghost.classList.add('drawer-leave');
      root.append(ghost);
      setTimeout(() => ghost.remove(), 260);
    }
    lastPanelKey = key;
    return changed;
  }

  function leaveView(node, workspace) {
    const rect = node.getBoundingClientRect();
    const host = workspace.getBoundingClientRect();
    node.removeAttribute('data-view');
    node.querySelectorAll('[data-panel]').forEach((panel) => panel.remove());
    node.style.cssText = `position:absolute;left:${rect.left - host.left}px;top:${rect.top - host.top}px;width:${rect.width}px;pointer-events:none`;
    node.classList.add('view-leave');
    setTimeout(() => node.remove(), 160);
  }

  function captureScroll(scope) {
    const map = new Map();
    scope.querySelectorAll('[data-scroll-key]').forEach((el) => map.set(el.dataset.scrollKey, [el.scrollLeft, el.scrollTop]));
    return map;
  }

  function restoreScroll(scope, map) {
    scope.querySelectorAll('[data-scroll-key]').forEach((el) => {
      const saved = map.get(el.dataset.scrollKey);
      if (saved) [el.scrollLeft, el.scrollTop] = saved;
    });
  }

  function focusSelector(el) {
    for (const attr of FOCUS_ATTRS) {
      if (el.hasAttribute(attr)) return `[${attr}="${cssValue(el.getAttribute(attr))}"]`;
    }
    if (el.hasAttribute('data-search')) return '[data-search]';
    if (el.hasAttribute('data-notes')) return '[data-notes]';
    if (el.name && el.value) return `[name="${cssValue(el.name)}"][value="${cssValue(el.value)}"]`;
    return null;
  }

  function captureFocus() {
    const el = document.activeElement;
    if (!el || el === document.body || !root.contains(el)) return null;
    const selector = focusSelector(el);
    if (!selector) return null;
    let start = null;
    let end = null;
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch { /* inputs like date/number have no selection API */ }
    return { selector, start, end, inOverlay: Boolean(el.closest('.overlay-host')) };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    const scope = saved.inOverlay ? root.querySelector('.overlay-host') : currentView();
    const el = scope?.querySelector(saved.selector);
    if (!el || el === document.activeElement) return;
    el.focus({ preventScroll: true });
    if (saved.start != null) {
      try {
        el.setSelectionRange(saved.start, saved.end);
      } catch { /* not a text input */ }
    }
  }

  function renderOverlayLayer(ctx) {
    const host = root.querySelector('.overlay-host');
    const html = renderOverlay(ctx).trim();
    if (html === lastOverlay) return;
    const wasOpen = Boolean(lastOverlay);
    const old = host.firstElementChild;
    lastOverlay = html;
    if (!html) {
      if (old && ANIMATE) {
        old.removeAttribute('data-overlay');
        old.querySelectorAll('[role]').forEach((node) => node.removeAttribute('role'));
        old.classList.add('is-leaving');
        setTimeout(() => old.remove(), 200);
      } else {
        host.replaceChildren();
      }
      if (lastFocusBeforeModal?.isConnected) lastFocusBeforeModal.focus({ preventScroll: true });
      lastFocusBeforeModal = null;
      return;
    }
    if (!wasOpen) lastFocusBeforeModal = document.activeElement;
    host.innerHTML = html;
    const panel = host.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!wasOpen) host.firstElementChild.classList.add('is-entering');
    const target = panel?.matches('[role="alertdialog"]')
      ? panel.querySelector('[data-action="confirm-no"]')
      : panel?.querySelector('.modal-body input:not([type="search"]):not([type="checkbox"]), .modal-body textarea, .modal-actions .btn:last-child');
    target?.focus({ preventScroll: true });
  }

  function syncToasts() {
    const host = root.querySelector('.toasts');
    const present = new Map([...host.querySelectorAll('.toast[data-toast]')].map((el) => [el.dataset.toast, el]));
    for (const toast of ui.toasts) {
      if (present.has(toast.id)) continue;
      const template = document.createElement('template');
      template.innerHTML = `<div class="toast" role="status" data-tone="${toast.tone}" data-toast="${toast.id}">
        <span class="toast-icon">${icon(TOAST_ICON[toast.tone] || 'bolt', 16)}</span>
        <span class="toast-msg">${esc(toast.message)}</span>
        <button type="button" class="icon-btn tiny" aria-label="Dismiss" data-action="dismiss-toast" data-toast-id="${toast.id}">${icon('close', 14)}</button>
      </div>`.trim();
      host.append(template.content.firstElementChild);
    }
    for (const [id, el] of present) {
      if (ui.toasts.some((toast) => toast.id === id)) continue;
      if (ANIMATE) {
        el.removeAttribute('role');
        el.removeAttribute('data-toast');
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 260);
      } else {
        el.remove();
      }
    }
  }

  function bindSentinel() {
    timelineObserver?.disconnect();
    timelineObserver = null;
    const sentinel = currentView()?.querySelector('[data-timeline-sentinel]');
    if (!sentinel || typeof IntersectionObserver !== 'function') return;
    timelineObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      const view = currentView();
      const total = view ? view.querySelectorAll('[data-activity-id]').length : 0;
      if (total < ui.chronicleLimit) return;
      ui.chronicleLimit += 20;
      render();
    }, { rootMargin: '200px' });
    timelineObserver.observe(sentinel);
  }

  function formatCount(format, value) {
    if (format === 'compact') return formatMoneyCompact(Math.round(value), currency());
    if (format === 'money') return formatMoney(Math.round(value), currency());
    if (format === 'percent') return `${Math.round(value)}%`;
    return String(Math.round(value));
  }

  function enhance(viewChanged) {
    if (!ANIMATE) return;
    const section = currentView();
    if (!section) return;
    const tooltip = section.querySelector('[data-chart-tooltip]');
    hideTooltip(tooltip);
    const money = (value) => formatMoneyCompact(Math.round(value), currency());
    section.querySelectorAll('canvas[data-chart], canvas[data-sparkline]').forEach((canvas) => {
      const kind = canvas.dataset.chart || 'sparkline';
      const key = canvas.dataset.chartKey || kind;
      const raw = canvas.dataset.model || '{}';
      const animate = viewChanged || chartSigs.get(key) !== raw;
      chartSigs.set(key, raw);
      mountChart(canvas, DRAWERS[kind], JSON.parse(raw), {
        animate,
        tooltip: kind === 'sparkline' ? null : tooltip,
        format: money,
      });
    });

    section.querySelectorAll('[data-count]').forEach((el) => {
      const key = el.dataset.countKey;
      const to = Number(el.dataset.count);
      const previous = counts.get(key);
      counts.set(key, to);
      const format = (value) => formatCount(el.dataset.countFormat, value);
      if (viewChanged || previous === undefined) countUp(el, 0, to, format);
      else if (previous !== to) countUp(el, previous, to, format);
    });

    revealObserver?.disconnect();
    if (typeof IntersectionObserver === 'function') {
      revealObserver = new IntersectionObserver((items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;
          item.target.classList.add('is-visible');
          revealed.add(item.target.dataset.activityId);
          revealObserver.unobserve(item.target);
        }
      }, { rootMargin: '0px 0px -40px 0px' });
      let stagger = 0;
      section.querySelectorAll('.entry[data-activity-id]').forEach((entry) => {
        if (revealed.has(entry.dataset.activityId)) {
          entry.classList.add('is-visible');
          return;
        }
        entry.style.setProperty('--delay', `${Math.min(stagger, 8) * 60}ms`);
        stagger += 1;
        revealObserver.observe(entry);
      });
    }

    if (pendingBurst) {
      const { id, origin } = pendingBurst;
      pendingBurst = null;
      const card = section.querySelector(`[data-deal-id="${cssValue(id)}"]`);
      const rect = card?.getBoundingClientRect();
      const point = rect && rect.width
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 }
        : origin || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      burst(root.querySelector('.fx-layer'), point);
      card?.classList.add('just-won');
    }
  }

  /* ───────────── helpers ───────────── */

  function go(hash) {
    ui.menuOpen = false;
    if (window.location.hash !== hash) window.location.hash = hash;
    render();
  }

  function pushToast(tone, message) {
    const id = crypto.randomUUID();
    const item = { id, tone, message, timer: 0 };
    item.timer = setTimeout(() => {
      ui.toasts = ui.toasts.filter((toast) => toast.id !== id);
      render();
    }, 3000);
    ui.toasts.push(item);
    if (ui.toasts.length > 4) {
      const dropped = ui.toasts.shift();
      clearTimeout(dropped.timer);
    }
  }

  function openModal(modal) {
    ui.modal = { ...modal, openedAt: now().toISOString() };
  }

  function closeTop() {
    if (ui.confirm) {
      ui.confirm = null;
      render();
      return;
    }
    if (ui.help) {
      ui.help = false;
      render();
      return;
    }
    if (ui.modal || ui.celebrate) {
      if (ui.modal?.type === 'convert') confirmConversion(store, ui.modal.dealId, false, { now: now() });
      ui.modal = null;
      ui.celebrate = false;
      render();
      return;
    }
    if (ui.menuOpen) {
      ui.menuOpen = false;
      render();
      return;
    }
    const route = parseRoute(window.location.hash);
    if (route.params.deal || route.params.contact) go(`#/${route.view}`);
  }

  function showFieldErrors(scope, errors) {
    for (const error of errors) {
      const input = scope.querySelector(`[data-field="${error.field}"]`);
      let node = scope.querySelector(`[data-error-for="${error.field}"]`);
      if (!node) {
        node = document.createElement('p');
        node.className = 'field-error';
        node.setAttribute('data-error-for', error.field);
        (input?.closest('label, .field') || scope.querySelector('.modal-body') || scope).append(node);
      }
      node.textContent = error.message;
      input?.setAttribute('aria-invalid', 'true');
    }
    scope.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
  }

  function clearFieldError(scope, name) {
    scope.querySelector(`[data-error-for="${name}"]`)?.remove();
    scope.querySelector(`[data-field="${name}"]`)?.removeAttribute('aria-invalid');
  }

  function read(scope, name) {
    return scope.querySelector(`[data-field="${name}"]`)?.value ?? '';
  }

  function routePreset() {
    const route = parseRoute(window.location.hash);
    return { contactId: route.params.contact || '', dealId: route.params.deal || '' };
  }

  function openActivity(type, preset = routePreset()) {
    let { contactId, dealId } = preset;
    if (dealId && !contactId) contactId = store.getById('deals', dealId)?.contactId || '';
    openModal({ type: 'activity', activityType: type || 'call', preset: { contactId: contactId || '', dealId: dealId || '' } });
    render();
  }

  function newForView() {
    const view = parseRoute(window.location.hash).view;
    if (view === 'pipeline' || view === 'briefing') openModal({ type: 'deal', preset: routePreset() });
    else if (view === 'chronicle') openModal({ type: 'activity', activityType: 'call', preset: routePreset() });
    else if (view === 'customers' && ui.selectedCustomerId) openModal({ type: 'order', customerId: ui.selectedCustomerId });
    else openModal({ type: 'contact' });
    render();
  }

  /* ───────────── deal movement ───────────── */

  function performMove(id, stage, origin = null) {
    const result = moveDeal(store, id, stage, { now: now() });
    if (result.needsConfirmation) {
      ui.confirm = {
        title: 'Move deal backward?',
        message: backwardMoveMessage(stageLabel(store.getSettings(), stage)),
        yes: 'Move',
        tone: 'warning',
        onYes: () => {
          ui.confirm = null;
          afterMove(moveDeal(store, id, stage, { now: now(), confirm: true }), id, stage, origin);
          render();
        },
      };
      render();
      return;
    }
    if (result.needsLostReason) {
      openModal({ type: 'lost', dealId: id });
      render();
      return;
    }
    afterMove(result, id, stage, origin);
    render();
  }

  function afterMove(result, id, stage, origin) {
    if (!result?.ok || result.celebrate === undefined) return;
    const deal = store.getById('deals', id);
    if (!deal) return;
    if (!result.celebrate) {
      pushToast('info', `Moved to ${stageLabel(store.getSettings(), stage)}`);
      return;
    }
    ui.celebrate = true;
    pendingBurst = { id, origin };
    const contact = store.getById('contacts', deal.contactId);
    if (result.askConversion) {
      const ask = () => openModal({ type: 'convert', dealId: id, name: contact?.name || 'this contact' });
      if (ANIMATE) setTimeout(ask, 900);
      else ask();
      return;
    }
    const customer = store.query('customers', (item) => item.contactId === deal.contactId)[0];
    if (customer) {
      store.create('orders', {
        customerId: customer.id,
        description: deal.title,
        amount: deal.value,
        status: 'completed',
        date: now().toISOString().slice(0, 10),
        notes: '',
      });
      pushToast('success', `Won! Order added to ${contact?.name || 'the customer'}'s history`);
    } else {
      pushToast('success', 'Deal won!');
    }
    setTimeout(() => {
      if (!ui.modal) {
        ui.celebrate = false;
        render();
      }
    }, 2000);
  }

  /* ───────────── events ───────────── */

  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    const target = event.target;
    if (target?.hasAttribute?.('data-overlay')) {
      closeTop();
      return;
    }
    if (target.closest('[aria-label="Collapse sidebar"]')) {
      ui.collapsed = !ui.collapsed;
      render();
      return;
    }
    if (target.closest('[aria-label="Open menu"]')) {
      ui.menuOpen = true;
      render();
      return;
    }
    const actionEl = target.closest('[data-action]');
    if (actionEl) {
      handleAction(actionEl);
      return;
    }
    const linked = target.closest('[data-link]');
    if (linked) {
      if (linked.dataset.link === 'contact') go(`#/roster?contact=${linked.dataset.id}`);
      if (linked.dataset.link === 'deal') go(`#/pipeline?deal=${linked.dataset.id}`);
      return;
    }
    const filterType = target.closest('[data-filter-type]');
    if (filterType) {
      ui.chronicleType = filterType.dataset.filterType;
      ui.chronicleLimit = 20;
      render();
      return;
    }
    const range = target.closest('[data-range]');
    if (range) {
      ui.radarRange = range.dataset.range;
      ui.radarCustomOpen = false;
      render();
      return;
    }
    const statusTab = target.closest('[data-status-tab]');
    if (statusTab) {
      ui.rosterStatus = statusTab.dataset.statusTab;
      render();
      return;
    }
    const tab = target.closest('[data-tab]');
    if (tab) {
      ui.customerTab = tab.dataset.tab;
      render();
      return;
    }
    const stageTab = target.closest('[data-mobile-stage-tab]');
    if (stageTab) {
      ui.mobileStage = stageTab.dataset.mobileStageTab;
      render();
      return;
    }
    const star = target.closest('[data-rating]');
    if (star && ui.selectedCustomerId) {
      store.update('customers', ui.selectedCustomerId, { satisfactionRating: Number(star.dataset.rating) });
      return;
    }
    const anchor = target.closest('a[href^="#/"]');
    if (anchor) {
      event.preventDefault();
      go(anchor.getAttribute('href'));
      return;
    }
    const priority = target.closest('[data-priority-id], [data-insight-id]');
    if (priority) {
      go(`#/pipeline?deal=${priority.dataset.priorityId || priority.dataset.insightId}`);
      return;
    }
    const feed = target.closest('[data-view="briefing"] [data-activity-id]');
    if (feed) {
      go(`#/chronicle?contact=${feed.dataset.contactId}`);
      return;
    }
    const deal = target.closest('[data-deal-id]');
    if (deal && !target.closest('button')) {
      go(`#/pipeline?deal=${deal.dataset.dealId}`);
      return;
    }
    const contact = target.closest('[data-contact-id]');
    if (contact && !target.closest('button, a')) {
      go(`#/roster?contact=${contact.dataset.contactId}`);
      return;
    }
    const customer = target.closest('button[data-customer-id]');
    if (customer) {
      ui.selectedCustomerId = customer.dataset.customerId;
      render();
    }
  }

  function handleAction(el) {
    const action = el.dataset.action;
    const dialog = root.querySelector('.overlay-host [role="dialog"]');
    switch (action) {
      case 'save-modal': return saveModal();
      case 'cancel-modal':
      case 'convert-no':
        if (ui.modal?.type === 'convert') confirmConversion(store, ui.modal.dealId, false, { now: now() });
        ui.modal = null;
        ui.help = false;
        ui.celebrate = false;
        render();
        return;
      case 'confirm-no':
        ui.confirm = null;
        render();
        return;
      case 'confirm-yes': {
        const run = ui.confirm?.onYes;
        ui.confirm = null;
        run?.();
        return;
      }
      case 'convert-yes': {
        const dealId = ui.modal?.dealId;
        const name = ui.modal?.name;
        ui.modal = null;
        ui.celebrate = false;
        const { customer } = confirmConversion(store, dealId, true, { now: now() });
        if (customer) ui.selectedCustomerId = customer.id;
        pushToast('success', `${name} is now a customer`);
        render();
        return;
      }
      case 'dismiss-toast': {
        const id = el.dataset.toastId;
        const toast = ui.toasts.find((item) => item.id === id);
        clearTimeout(toast?.timer);
        ui.toasts = ui.toasts.filter((item) => item.id !== id);
        render();
        return;
      }
      case 'show-help':
        ui.help = true;
        render();
        return;
      case 'close-menu':
        ui.menuOpen = false;
        render();
        return;
      case 'close-panel':
        go(`#/${parseRoute(window.location.hash).view}`);
        return;
      case 'new-context':
        newForView();
        return;
      case 'new-contact':
        openModal({ type: 'contact' });
        render();
        return;
      case 'new-deal':
        openModal({ type: 'deal', preset: { contactId: el.dataset.contactId || routePreset().contactId || '' } });
        render();
        return;
      case 'new-order':
        openModal({ type: 'order', customerId: ui.selectedCustomerId });
        render();
        return;
      case 'edit-deal':
        openModal({ type: 'deal', id: el.dataset.id });
        render();
        return;
      case 'edit-contact':
        openModal({ type: 'contact', id: el.dataset.id });
        render();
        return;
      case 'edit-activity':
        openModal({ type: 'activity', id: el.dataset.id });
        render();
        return;
      case 'quick-log':
        openActivity(el.dataset.log);
        return;
      case 'log':
        openActivity(el.dataset.logType, { contactId: el.dataset.contactRef || '', dealId: el.dataset.dealRef || '' });
        return;
      case 'toggle-lost':
        ui.showLost = !ui.showLost;
        render();
        return;
      case 'clear-search':
        ui.filters.search = '';
        render();
        return;
      case 'clear-filter': {
        const key = el.dataset.filter;
        if (key.startsWith('priority:')) ui.filters.priorities = ui.filters.priorities.filter((p) => p !== key.slice(9));
        else if (key === 'created') Object.assign(ui.filters, { createdFrom: '', createdTo: '' });
        else ui.filters[key] = '';
        render();
        return;
      }
      case 'clear-filters':
        ui.filters = emptyFilters();
        render();
        return;
      case 'toggle-desc': {
        const desc = el.previousElementSibling;
        const collapsed = desc?.classList.toggle('clamp-2');
        el.textContent = collapsed ? 'Show more' : 'Show less';
        return;
      }
      case 'custom-range':
        ui.radarCustomOpen = !ui.radarCustomOpen || ui.radarRange !== 'custom';
        render();
        return;
      case 'pick-reason': {
        const input = dialog?.querySelector('[data-field="lostReason"]');
        if (input) {
          input.value = el.dataset.reason;
          clearFieldError(dialog, 'lostReason');
          dialog.querySelectorAll('[data-action="pick-reason"]').forEach((chip) => chip.classList.toggle('is-on', chip === el));
        }
        return;
      }
      case 'open-customer':
        ui.selectedCustomerId = el.dataset.customerRef;
        ui.customerTab = 'orders';
        go('#/customers');
        return;
      case 'delete': return askDelete(el.dataset.kind, el.dataset.id);
      case 'add-tag': return addTag();
      case 'export': return exportBackup();
      case 'replace-import': {
        const json = ui.importJson;
        ui.modal = null;
        store.importAll(json);
        pushToast('success', 'Backup imported');
        render();
        return;
      }
      case 'reset-demo':
        ui.confirm = {
          title: 'Reset demo data?',
          message: 'Replace everything with demo data? This cannot be undone.',
          yes: 'Reset',
          onYes: () => {
            store.resetDemo();
            ui.confirm = null;
            pushToast('success', 'Demo data restored');
            render();
          },
        };
        render();
        return;
      case 'clear-all':
        ui.confirm = {
          title: 'Clear all data?',
          message: 'Clear all data? This cannot be undone.',
          yes: 'Clear data',
          onYes: () => {
            ui.confirm = {
              title: 'Really erase everything?',
              message: 'Are you sure? This will erase every contact, deal, and note.',
              yes: 'Clear data',
              onYes: () => {
                store.clearAll();
                ui.selectedCustomerId = null;
                ui.confirm = null;
                pushToast('info', 'All data cleared');
                render();
              },
            };
            render();
          },
        };
        render();
        return;
      default:
    }
  }

  function askDelete(kind, id) {
    if (kind === 'deal') {
      const deal = store.getById('deals', id);
      ui.confirm = {
        title: 'Delete deal?',
        message: deleteDealMessage(deal?.title || 'this deal'),
        yes: 'Delete',
        onYes: () => {
          for (const activity of store.query('activities', (item) => item.dealId === id)) store.update('activities', activity.id, { dealId: null });
          store.delete('deals', id);
          ui.confirm = null;
          pushToast('success', 'Deal deleted');
          go('#/pipeline');
        },
      };
    } else if (kind === 'contact') {
      const contact = store.getById('contacts', id);
      const dealCount = store.query('deals', (deal) => deal.contactId === id).length;
      ui.confirm = {
        title: 'Delete contact?',
        message: deleteContactMessage(contact?.name || 'this contact', dealCount),
        yes: 'Delete',
        onYes: () => {
          for (const deal of store.query('deals', (item) => item.contactId === id)) store.delete('deals', deal.id);
          for (const activity of store.query('activities', (item) => item.contactId === id)) store.delete('activities', activity.id);
          for (const customer of store.query('customers', (item) => item.contactId === id)) {
            for (const order of store.query('orders', (item) => item.customerId === customer.id)) store.delete('orders', order.id);
            store.delete('customers', customer.id);
          }
          store.delete('contacts', id);
          ui.confirm = null;
          pushToast('success', 'Contact deleted');
          go('#/roster');
        },
      };
    } else if (kind === 'activity') {
      const activity = store.getById('activities', id);
      ui.confirm = {
        title: 'Delete activity?',
        message: `Delete ${activity?.title || 'this activity'}? This cannot be undone.`,
        yes: 'Delete',
        onYes: () => {
          store.delete('activities', id);
          ui.confirm = null;
          pushToast('success', 'Activity deleted');
          render();
        },
      };
    } else if (kind === 'tag') {
      const tag = store.getById('tags', id);
      const used = store.query('contacts', (contact) => (contact.tags || []).includes(id));
      ui.confirm = {
        title: 'Delete tag?',
        message: `Delete the “${tag?.name}” tag${used.length ? ` and remove it from ${used.length} contact${used.length === 1 ? '' : 's'}` : ''}? This cannot be undone.`,
        yes: 'Delete',
        onYes: () => {
          for (const contact of used) store.update('contacts', contact.id, { tags: contact.tags.filter((tagId) => tagId !== id) });
          store.delete('tags', id);
          ui.confirm = null;
          pushToast('success', 'Tag deleted');
          render();
        },
      };
    }
    render();
  }

  function saveModal() {
    const dialog = root.querySelector('.overlay-host [role="dialog"]');
    const modal = ui.modal;
    if (!dialog || !modal) return;
    if (modal.type === 'contact') {
      const existing = modal.id ? store.getById('contacts', modal.id) : null;
      const data = {
        name: read(dialog, 'name').trim(),
        email: read(dialog, 'email').trim(),
        phone: read(dialog, 'phone').trim(),
        company: read(dialog, 'company').trim(),
        title: read(dialog, 'title').trim(),
        tags: [...dialog.querySelectorAll('[data-tag-option]:checked')].map((input) => input.value),
        notes: read(dialog, 'notes'),
        status: read(dialog, 'status') || existing?.status || 'prospect',
        source: read(dialog, 'source').trim(),
      };
      const result = validateContact(data, { tags: store.getAll('tags') });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      if (existing) store.update('contacts', existing.id, data);
      else store.create('contacts', data);
      pushToast('success', existing ? 'Contact updated' : 'Contact saved');
      render();
      return;
    }
    if (modal.type === 'deal') {
      const existing = modal.id ? store.getById('deals', modal.id) : null;
      const stage = read(dialog, 'stage') || 'prospect';
      const rawProbability = read(dialog, 'probability');
      const data = {
        title: read(dialog, 'title').trim(),
        contactId: read(dialog, 'contact'),
        value: Number(read(dialog, 'value')),
        priority: read(dialog, 'priority') || 'medium',
        expectedCloseDate: read(dialog, 'expectedCloseDate'),
        notes: read(dialog, 'notes'),
      };
      const check = validateDeal({ ...data, stage, lostReason: 'pending' }, { contacts: store.getAll('contacts') });
      if (read(dialog, 'value') === '') check.errors.push({ field: 'value', message: 'Value is required' });
      if (check.errors.length) {
        return showFieldErrors(dialog, check.errors.map((error) => (
          error.field === 'contactId' ? { ...error, field: 'contact' } : error
        )));
      }
      ui.modal = null;
      if (existing) {
        const probability = rawProbability === '' ? existing.probability : Math.min(100, Math.max(0, Number(rawProbability)));
        const lostReason = dialog.querySelector('[data-field="lostReason"]') ? read(dialog, 'lostReason').trim() : existing.lostReason;
        store.update('deals', existing.id, { ...data, probability, lostReason });
        pushToast('success', 'Deal updated');
        if (stage !== existing.stage) performMove(existing.id, stage);
        else render();
        return;
      }
      store.create('deals', {
        ...data,
        stage,
        probability: rawProbability === '' ? STAGE_PROBABILITY[stage] ?? 10 : Math.min(100, Math.max(0, Number(rawProbability))),
        lostReason: '',
        stageChangedAt: now().toISOString(),
        stageHistory: [{ stage, at: now().toISOString() }],
      });
      pushToast('success', 'Deal created');
      render();
      return;
    }
    if (modal.type === 'activity') {
      const existing = modal.id ? store.getById('activities', modal.id) : null;
      const duration = read(dialog, 'duration');
      const rawDate = read(dialog, 'date');
      const parsed = rawDate ? new Date(rawDate) : null;
      const data = {
        type: existing?.type || modal.activityType || 'call',
        contactId: read(dialog, 'contact'),
        dealId: read(dialog, 'deal') || null,
        title: read(dialog, 'title').trim(),
        description: read(dialog, 'description'),
        date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
        duration: duration === '' ? null : Number(duration),
        outcome: read(dialog, 'outcome'),
      };
      const result = validateActivity(data, { contacts: store.getAll('contacts'), deals: store.getAll('deals') });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      if (existing) store.update('activities', existing.id, data);
      else store.create('activities', data);
      pushToast('success', existing ? 'Activity updated' : 'Activity logged');
      render();
      return;
    }
    if (modal.type === 'order') {
      const data = {
        customerId: modal.customerId || ui.selectedCustomerId,
        description: read(dialog, 'description').trim(),
        amount: Number(read(dialog, 'amount')),
        status: read(dialog, 'status') || 'completed',
        date: read(dialog, 'date'),
        notes: read(dialog, 'notes'),
      };
      const result = validateOrder(data);
      if (read(dialog, 'amount') === '' && !result.errors.some((error) => error.field === 'amount')) {
        result.errors.push({ field: 'amount', message: 'Amount is required' });
      }
      if (result.errors.length) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      store.create('orders', data);
      pushToast('success', 'Order saved');
      render();
      return;
    }
    if (modal.type === 'lost') {
      const lostReason = read(dialog, 'lostReason').trim();
      if (!lostReason) {
        showFieldErrors(dialog, [{ field: 'lostReason', message: 'Lost reason is required' }]);
        return;
      }
      ui.modal = null;
      moveDeal(store, modal.dealId, 'lost', { now: now(), lostReason, confirm: true });
      ui.showLost = true;
      pushToast('info', 'Deal marked as lost');
      render();
    }
  }

  function addTag() {
    const view = root.querySelector('[data-view="settings"]');
    const name = view?.querySelector('[data-field="tagName"]')?.value ?? '';
    const color = view?.querySelector('[data-field="tagColor"]')?.value ?? '';
    const result = validateTag({ name, color }, { tags: store.getAll('tags') });
    if (!result.ok) {
      ui.tagError = result.errors[0]?.message || 'Tag name is required';
      render();
      return;
    }
    ui.tagError = '';
    store.create('tags', { name: name.trim(), color: color.trim() });
    pushToast('success', `Tag “${name.trim()}” added`);
    render();
  }

  function exportBackup() {
    const json = store.exportAll();
    const link = document.createElement('a');
    link.download = exportFilename(now());
    link.dataset.export = json;
    link.hidden = true;
    document.body.appendChild(link);
    if (ANIMATE && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.href = url;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 1000);
    } else {
      link.href = '#';
    }
    pushToast('success', `Exported ${link.download}`);
    render();
  }

  async function readFile(file) {
    if (typeof file?.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function loadImport(file) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file));
    } catch {
      pushToast('error', 'That file could not be read');
      render();
      return;
    }
    if (!validateImport(parsed).ok) {
      pushToast('error', 'That file is not a NEXUS backup');
      render();
      return;
    }
    ui.importJson = JSON.stringify(parsed);
    openModal({
      type: 'import',
      preview: importPreviewText({
        contacts: parsed.contacts.length,
        deals: parsed.deals.length,
        activities: parsed.activities.length,
        customers: parsed.customers.length,
        orders: parsed.orders.length,
        tags: parsed.tags.length,
      }),
    });
    render();
  }

  function filterPicker(dialog, input) {
    const select = dialog.querySelector(`[data-field="${input.dataset.pickerFor}"]`);
    if (!select) return;
    const needle = input.value.trim().toLowerCase();
    let firstVisible = null;
    for (const option of select.options) {
      if (!option.value) continue;
      const match = !needle || option.textContent.toLowerCase().includes(needle);
      option.hidden = !match;
      if (match && !firstVisible) firstVisible = option;
    }
    if (needle && firstVisible && (select.selectedOptions[0]?.hidden || !select.value)) {
      select.value = firstVisible.value;
      syncDealOptions(dialog);
      clearFieldError(dialog, select.dataset.field);
    }
  }

  function syncDealOptions(dialog) {
    const dealSelect = dialog.querySelector('[data-field="deal"]');
    if (!dealSelect) return;
    const contactId = read(dialog, 'contact');
    for (const option of dealSelect.options) {
      if (!option.value) continue;
      const mismatch = Boolean(contactId) && option.dataset.contact !== contactId;
      option.hidden = mismatch;
      option.disabled = mismatch;
    }
    if (dealSelect.selectedOptions[0]?.disabled) dealSelect.value = '';
  }

  function onInput(event) {
    const el = event.target;
    const dialog = el.closest('[role="dialog"], [role="alertdialog"]');
    if (dialog) {
      if (el.dataset.pickerFor) filterPicker(dialog, el);
      if (el.dataset.field) clearFieldError(dialog, el.dataset.field);
      return;
    }
    if (el.matches('[data-search]')) {
      const view = el.closest('[data-view]')?.dataset.view;
      if (view === 'roster') {
        ui.rosterDraft = el.value;
        applyRoster(el.value);
      } else if (view === 'customers') {
        ui.customerQuery = el.value;
        render();
      } else if (view === 'pipeline') {
        ui.filters.search = el.value;
        render();
      }
      return;
    }
    if (el.dataset.field === 'userName') {
      store.updateSettings({ userName: el.value });
      return;
    }
    if (el.dataset.field === 'currency') {
      store.updateSettings({ currency: el.value });
      return;
    }
    if (el.dataset.stageId) {
      try {
        const next = renameStage(store.getSettings(), el.dataset.stageId, el.value);
        store.updateSettings({ stages: next.stages });
      } catch {
        /* blank names stay uncommitted */
      }
      return;
    }
    if (el.dataset.field === 'minValue' || el.dataset.field === 'maxValue') {
      ui.filters[el.dataset.field] = el.value;
      render();
    }
  }

  function onChange(event) {
    const el = event.target;
    const field = el.dataset.field;
    if (field === 'import' && el.files?.[0]) {
      const file = el.files[0];
      loadImport(file);
      try {
        el.value = '';
      } catch { /* some environments disallow resetting file inputs */ }
      return;
    }
    if (el.closest('[role="dialog"]')) {
      if (field === 'contact') syncDealOptions(el.closest('[role="dialog"]'));
      return;
    }
    if (el.name === 'priority') {
      const selected = new Set(ui.filters.priorities);
      if (el.checked) selected.add(el.value);
      else selected.delete(el.value);
      ui.filters.priorities = [...selected];
      render();
      return;
    }
    if (el.dataset.moveStage) {
      performMove(el.dataset.moveStage, el.value);
      return;
    }
    if (field === 'createdFrom' || field === 'createdTo') {
      ui.filters[field] = el.value;
      render();
      return;
    }
    if (field === 'chronFrom' || field === 'chronTo') {
      ui[field === 'chronFrom' ? 'chronicleFrom' : 'chronicleTo'] = el.value;
      ui.chronicleLimit = 20;
      render();
      return;
    }
    if (field === 'chronContact') {
      ui.chronicleLimit = 20;
      go(el.value ? `#/chronicle?contact=${el.value}` : '#/chronicle');
      return;
    }
    if (field === 'radarFrom' || field === 'radarTo') {
      ui[field] = el.value;
      ui.radarRange = 'custom';
      render();
      return;
    }
    if (el.dataset.tagName) {
      const name = el.value.trim();
      const tags = store.getAll('tags');
      const current = tags.find((tag) => tag.id === el.dataset.tagName);
      if (!name || tags.some((tag) => tag.id !== current?.id && tag.name.toLowerCase() === name.toLowerCase())) {
        pushToast('error', name ? 'A tag with that name already exists' : 'Tag name is required');
        el.value = current?.name ?? '';
        render();
        return;
      }
      if (current && current.name !== name) store.update('tags', current.id, { name });
      return;
    }
    if (el.dataset.tagColor) {
      store.update('tags', el.dataset.tagColor, { color: el.value });
    }
  }

  function onBlur(event) {
    const notes = event.target?.closest?.('[data-notes]');
    if (!notes) return;
    saveNotes(ui.selectedCustomerId, notes.value);
  }

  /* HTML5 drag & drop (keyboard-less fallback, also what assistive tech and tests exercise). */
  function onDragStart(event) {
    const card = event.target.closest?.('[data-deal-id]');
    if (!card || !event.dataTransfer) return;
    if (ANIMATE) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('text/plain', card.dataset.dealId);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event) {
    if (event.target.closest?.('[data-stage]')) event.preventDefault();
  }

  function onDrop(event) {
    const column = event.target.closest?.('[data-stage]');
    if (!column || !event.dataTransfer) return;
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id) performMove(id, column.dataset.stage, { x: event.clientX, y: event.clientY });
  }

  /* Pointer dragging with spring physics for mouse and pen. */
  function onPointerDown(event) {
    if (!ANIMATE || event.button !== 0 || event.pointerType === 'touch') return;
    const card = event.target.closest('.deal-card[data-deal-id]');
    if (!card || event.target.closest('button, a, input, select')) return;
    drag = { id: card.dataset.dealId, card, startX: event.clientX, startY: event.clientY, active: false };
  }

  function startDrag(event) {
    const rect = drag.card.getBoundingClientRect();
    const ghost = drag.card.cloneNode(true);
    ghost.removeAttribute('data-deal-id');
    ghost.classList.add('drag-ghost', 'is-dragging');
    ghost.style.width = `${rect.width}px`;
    document.body.append(ghost);
    Object.assign(drag, {
      active: true,
      ghost,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      vx: 0,
      vy: 0,
      tx: rect.left,
      ty: rect.top,
      from: drag.card.closest('[data-stage]')?.dataset.stage,
    });
    drag.card.classList.add('is-drag-source');
    root.classList.add('is-dragging-deal');
    const spring = () => {
      if (!drag?.active) return;
      drag.vx = (drag.vx + (drag.tx - drag.x) * 0.22) * 0.68;
      drag.vy = (drag.vy + (drag.ty - drag.y) * 0.22) * 0.68;
      drag.x += drag.vx;
      drag.y += drag.vy;
      const tilt = Math.max(-8, Math.min(8, 2 + drag.vx * 0.6));
      drag.ghost.style.transform = `translate(${drag.x}px, ${drag.y}px) rotate(${tilt}deg) scale(1.05)`;
      drag.raf = requestAnimationFrame(spring);
    };
    drag.raf = requestAnimationFrame(spring);
  }

  function onPointerMove(event) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      startDrag(event);
    }
    drag.tx = event.clientX - drag.offsetX;
    drag.ty = event.clientY - drag.offsetY;
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-stage]');
    root.querySelectorAll('.stage.drop-hover').forEach((node) => node !== column && node.classList.remove('drop-hover'));
    column?.classList.add('drop-hover');
    const board = root.querySelector('.board');
    if (board) {
      const rect = board.getBoundingClientRect();
      if (event.clientX > rect.right - 60) board.scrollLeft += 14;
      else if (event.clientX < rect.left + 60) board.scrollLeft -= 14;
    }
  }

  function onPointerUp(event) {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (!current.active) return;
    cancelAnimationFrame(current.raf);
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    current.ghost.style.display = 'none';
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-stage]');
    current.ghost.remove();
    current.card.classList.remove('is-drag-source');
    root.classList.remove('is-dragging-deal');
    root.querySelectorAll('.stage.drop-hover').forEach((node) => node.classList.remove('drop-hover'));
    if (column && column.dataset.stage !== current.from) {
      performMove(current.id, column.dataset.stage, { x: event.clientX, y: event.clientY });
    }
  }

  function onTouchStart(event) {
    const point = event.touches[0];
    touch = {
      x: point.clientX,
      y: point.clientY,
      card: event.target.closest('.deal-card[data-deal-id]'),
      board: event.target.closest('.board, [data-stage-pager]'),
    };
  }

  function onTouchEnd(event) {
    if (!touch) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    const { card, board } = touch;
    touch = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (card && (dx < 0 || card.dataset.swiped === 'true')) {
      root.querySelectorAll('.deal-card[data-swiped="true"]').forEach((node) => node !== card && delete node.dataset.swiped);
      if (dx < 0) card.dataset.swiped = 'true';
      else delete card.dataset.swiped;
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 350);
      return;
    }
    if (board && window.matchMedia?.('(max-width: 767px)').matches) {
      const order = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];
      const index = order.indexOf(ui.mobileStage);
      ui.mobileStage = order[Math.max(0, Math.min(order.length - 1, index + (dx < 0 ? 1 : -1)))];
      render();
    }
  }

  function trapFocus(event) {
    const panel = root.querySelector('.overlay-host [role="dialog"], .overlay-host [role="alertdialog"]');
    if (!panel) return false;
    const focusable = [...panel.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      return true;
    }
    return false;
  }

  function onKey(event) {
    if (event.key === 'Tab' && lastOverlay && trapFocus(event)) {
      event.preventDefault();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && !lastOverlay) {
      const card = event.target.closest?.('.deal-card[data-deal-id], .contact-card[data-contact-id]');
      if (card && event.target === card) {
        event.preventDefault();
        card.click();
        return;
      }
    }
    const action = shortcutAction(event);
    if (!action) return;
    if (action.type !== 'close' && (lastOverlay || ui.confirm)) return;
    if (action.type === 'close') {
      event.preventDefault();
      closeTop();
      return;
    }
    if (action.type === 'navigate') {
      event.preventDefault();
      go(action.hash);
      return;
    }
    if (action.type === 'search') {
      event.preventDefault();
      currentView()?.querySelector('[data-search]')?.focus();
      return;
    }
    if (action.type === 'help') {
      ui.help = true;
      render();
      return;
    }
    if (action.type === 'create') {
      event.preventDefault();
      newForView();
    }
  }

  function start() {
    stopPrevious();
    alive = true;
    const onHash = () => render();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('blur', onBlur, true);
    root.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd);
    const onStore = () => render();
    store.subscribe(onStore);
    stopPrevious = () => {
      alive = false;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      timelineObserver?.disconnect();
      revealObserver?.disconnect();
      stopParticles();
      for (const toast of ui.toasts) clearTimeout(toast.timer);
      store.unsubscribe(onStore);
    };
    render();
  }

  return { store, start };
}
