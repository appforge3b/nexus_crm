import { Store } from './store.js';
import { parseRoute } from './router.js';
import { shortcutAction } from './keyboard.js';
import { debounce } from './debounce.js';
import { renderOverlay, renderShell, renderView } from './views.js';
import { moveDeal, confirmConversion, STAGE_PROBABILITY } from './deals.js';
import { renameStage, stageLabel } from './settings.js';
import { companyOf, ensureCompany, peopleAt, stakeholderEntries } from './companies.js';
import { isPlanned, shiftDate, shortDate } from './agenda.js';
import { mailtoLink, renderTemplate, templatesFrom, waLink } from './messaging.js';
import { createDictation, formatClock, speechFactory as browserSpeech, suggestTitle } from './voice.js';
import { SHEET_TYPES, composerContext, whenPreset } from './sheets.js';
import { companyHint, localDateTime } from './view-helpers.js';
import {
  validateActivity,
  validateCompany,
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
const FOCUS_ATTRS = ['data-field', 'data-stage-id', 'data-tag-name', 'data-tag-color', 'data-move-stage', 'data-picker-for', 'data-template-name', 'data-template-body', 'data-stakeholder-role'];

let stopPrevious = () => {};

function emptyFilters() {
  return { search: '', minValue: '', maxValue: '', priorities: [], createdFrom: '', createdTo: '' };
}

export function createApp({
  root,
  storage,
  clock,
  seed = false,
  storageKey = 'nexus_data',
  demoMode = seed,
  openUrl = null,
  speechFactory = undefined,
  clipboard = undefined,
}) {
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
    rosterMode: 'people',
    customerQuery: '',
    chronicleType: 'all',
    chronicleStatus: 'all',
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
  let todayObserver = null;
  let lastChronicleKey = '';
  let pendingCall = null;
  let dictation = null;
  let voiceTimer = 0;
  let wakeLock = null;
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
      companies: store.getAll('companies'),
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
    if (dictation && !(ui.modal?.type === 'voice' && ui.modal.phase === 'recording')) endDictation();
    updateShell(ctx);
    const viewChanged = renderMain(ctx);
    renderOverlayLayer(ctx);
    syncToasts();
    root.querySelector('.fx-layer')?.toggleAttribute('data-celebration', Boolean(ui.celebrate));
    restoreFocus(focus);
    anchorChronicle(ctx, viewChanged);
    bindSentinel();
    enhance(viewChanged);
  }

  /* Upcoming steps sit above the Today anchor, history below it, so the Chronicle opens scrolled to Today. */
  function anchorChronicle(ctx, viewChanged) {
    todayObserver?.disconnect();
    todayObserver = null;
    if (ctx.route.view !== 'chronicle') {
      lastChronicleKey = '';
      return;
    }
    const key = `${window.location.hash}|${ui.chronicleType}|${ui.chronicleStatus}|${ui.chronicleFrom}|${ui.chronicleTo}`;
    if (viewChanged || key !== lastChronicleKey) scrollToToday('auto');
    lastChronicleKey = key;
    const anchor = currentView()?.querySelector('[data-today-anchor]');
    const jump = currentView()?.querySelector('.jump-today');
    if (!anchor || !jump || typeof IntersectionObserver !== 'function') return;
    todayObserver = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.target === anchor);
      if (!entry) return;
      const above = (entry.boundingClientRect?.top ?? 0) < 0;
      jump.dataset.visible = entry.isIntersecting ? 'false' : 'true';
      jump.dataset.direction = above ? 'up' : 'down';
      jump.innerHTML = `${icon(above ? 'arrow-up' : 'arrow-down', 14)}<span>Today</span>`;
    });
    todayObserver.observe(anchor);
  }

  function scrollToToday(behavior = 'smooth') {
    const anchor = currentView()?.querySelector('[data-today-anchor]');
    if (!anchor || !ANIMATE) return;
    const offset = window.matchMedia?.('(max-width: 767px)').matches ? 72 : 24;
    window.scrollTo({ top: Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - offset), behavior });
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
        ${toast.action ? `<button type="button" class="toast-action" data-action="toast-action" data-toast-id="${toast.id}">${esc(toast.action.label)}</button>` : ''}
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
      const total = view ? view.querySelectorAll('[data-stream="done"]').length : 0;
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

  function pushToast(tone, message, action = null) {
    const id = crypto.randomUUID();
    const item = { id, tone, message, timer: 0, action };
    item.timer = setTimeout(() => {
      ui.toasts = ui.toasts.filter((toast) => toast.id !== id);
      render();
    }, action ? 6000 : 3000);
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
    if (route.params.deal || route.params.contact || route.params.company) go(`#/${route.view}`);
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
    return { contactId: route.params.contact || '', dealId: route.params.deal || '', companyId: route.params.company || '' };
  }

  function refsOf(el) {
    const refs = { contactId: el.dataset.contactRef || '', dealId: el.dataset.dealRef || '', companyId: el.dataset.companyRef || '' };
    return refs.contactId || refs.dealId || refs.companyId ? refs : routePreset();
  }

  /** Fills in the contact for a deal or company reference: the deal's primary, else the first person at the company. */
  function resolveRefs({ contactId = '', dealId = '', companyId = '' } = {}) {
    const deal = dealId ? store.getById('deals', dealId) : null;
    if (!contactId && deal) contactId = deal.contactId;
    if (!contactId && companyId) {
      const company = store.getById('companies', companyId);
      contactId = peopleAt(company, store.getAll('contacts'), store.getAll('companies'))[0]?.id || '';
    }
    return { contactId, dealId: deal ? dealId : '', companyId };
  }

  /** The newest open deal a contact is involved in, used when a message or note needs a deal context. */
  function openDealFor(contactId) {
    if (!contactId) return '';
    const active = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing'];
    const deals = store.query('deals', (deal) => active.includes(deal.stage)
      && stakeholderEntries(deal).some((entry) => entry.contactId === contactId));
    return deals.sort((a, b) => new Date(b.stageChangedAt || b.createdAt) - new Date(a.stageChangedAt || a.createdAt))[0]?.id || '';
  }

  function openActivity(type, preset = routePreset()) {
    const { contactId, dealId } = resolveRefs(preset);
    openModal({ type: 'activity', activityType: type || 'call', preset: { ...preset, contactId: contactId || '', dealId: dealId || '' } });
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
    const companyId = deal.companyId || companyIdFor(deal.contactId);
    const customer = store.query('customers', (item) => item.contactId === deal.contactId)[0]
      || (companyId ? store.query('customers', (item) => (item.companyId || companyIdFor(item.contactId)) === companyId)[0] : null);
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
      handleAction(actionEl, event);
      return;
    }
    const linked = target.closest('[data-link]');
    if (linked) {
      if (linked.dataset.link === 'contact') go(`#/roster?contact=${linked.dataset.id}`);
      if (linked.dataset.link === 'deal') go(`#/pipeline?deal=${linked.dataset.id}`);
      if (linked.dataset.link === 'company') {
        ui.rosterMode = 'companies';
        go(`#/roster?company=${linked.dataset.id}`);
      }
      return;
    }
    const rosterMode = target.closest('[data-roster-mode]');
    if (rosterMode) {
      ui.rosterMode = rosterMode.dataset.rosterMode;
      const route = parseRoute(window.location.hash);
      if (route.params.contact || route.params.company) go('#/roster');
      else render();
      return;
    }
    const chronStatus = target.closest('[data-chron-status]');
    if (chronStatus) {
      ui.chronicleStatus = chronStatus.dataset.chronStatus;
      ui.chronicleLimit = 20;
      render();
      return;
    }
    const companyCard = target.closest('.company-card[data-company-id]');
    if (companyCard && !target.closest('button, a')) {
      go(`#/roster?company=${companyCard.dataset.companyId}`);
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

  function handleAction(el, event) {
    const action = el.dataset.action;
    const dialog = root.querySelector('.overlay-host [role="dialog"]');
    if (el.getAttribute('aria-disabled') === 'true') {
      event?.preventDefault();
      return;
    }
    switch (action) {
      case 'toast-action': {
        const toast = ui.toasts.find((item) => item.id === el.dataset.toastId);
        clearTimeout(toast?.timer);
        ui.toasts = ui.toasts.filter((item) => item.id !== el.dataset.toastId);
        toast?.action?.run();
        render();
        return;
      }
      case 'new-company':
        openModal({ type: 'company' });
        render();
        return;
      case 'edit-company':
        openModal({ type: 'company', id: el.dataset.id });
        render();
        return;
      case 'add-stakeholder': return addStakeholder(el);
      case 'remove-stakeholder': return removeStakeholder(el.dataset.dealRef, el.dataset.contactRef);
      case 'make-primary': return makePrimary(el.dataset.dealRef, el.dataset.contactRef);
      case 'plan-step': return openPlan(refsOf(el));
      case 'step-done': return openComplete(el.dataset.id);
      case 'reschedule': return reschedule(el.dataset.id, Number(el.dataset.days) || 1);
      case 'pick-title': {
        const input = dialog?.querySelector('[data-field="title"]');
        if (!input) return;
        input.value = el.dataset.title;
        rememberDraft('title', input.value);
        clearFieldError(dialog, 'title');
        input.focus({ preventScroll: true });
        return;
      }
      case 'pick-when': {
        const input = dialog?.querySelector('[data-field="date"]');
        if (!input) return;
        input.value = localDateTime(whenPreset(el.dataset.when, now()));
        rememberDraft('date', input.value);
        clearFieldError(dialog, 'date');
        dialog.querySelectorAll('[data-action="pick-when"]').forEach((chip) => chip.classList.toggle('is-on', chip === el));
        return;
      }
      case 'pick-contact': {
        const select = dialog?.querySelector('[data-field="contact"]');
        if (!select) return;
        select.value = el.dataset.contactRef;
        rememberDraft('contact', select.value);
        syncDealOptions(dialog);
        clearFieldError(dialog, 'contact');
        return;
      }
      case 'jump-today':
        scrollToToday('smooth');
        return;
      case 'scroll-upcoming': {
        const top = currentView()?.querySelector('[data-upcoming-top]');
        if (top && ANIMATE) window.scrollTo({ top: Math.max(0, top.getBoundingClientRect().top + window.scrollY - 24), behavior: 'smooth' });
        return;
      }
      case 'compose': return openComposer(refsOf(el));
      case 'pick-recipient':
        if (!ui.modal) return;
        ui.modal.contactId = el.dataset.contactRef;
        render();
        return;
      case 'pick-template': return applyTemplate(el.dataset.templateId);
      case 'send-whatsapp': return sendMessage('whatsapp', el, event);
      case 'send-email': return sendMessage('email', el, event);
      case 'copy-message': {
        const text = composedText();
        if (!text) return;
        copyText(text, 'Message copied');
        return;
      }
      case 'call-sheet': return openCall(el);
      case 'call-change':
        if (!ui.modal) return;
        ui.modal.contactId = '';
        render();
        return;
      case 'call-via': return callVia(el, event);
      case 'copy-number': {
        const contact = store.getById('contacts', el.dataset.contactRef);
        if (contact?.phone) copyText(contact.phone, 'Number copied');
        return;
      }
      case 'log-past-call': {
        const { contactId, dealId } = ui.modal || {};
        ui.modal = null;
        openActivity('call', { contactId, dealId });
        return;
      }
      case 'voice-note': return openVoice(refsOf(el));
      case 'voice-toggle':
        if (!dictation) return;
        if (dictation.state === 'listening') dictation.pause();
        else dictation.start();
        return;
      case 'voice-stop': return finishRecording();
      case 'voice-resume': return resumeRecording();
      case 'add-template': {
        const templates = editableTemplates();
        templates.push({ id: crypto.randomUUID(), name: 'New template', body: 'Hi {firstName}, ' });
        store.updateSettings({ templates });
        root.querySelector(`[data-template-name="${templates.length - 1}"]`)?.focus();
        return;
      }
      case 'delete-template': {
        const templates = editableTemplates().filter((_, index) => index !== Number(el.dataset.index));
        if (!templates.length) {
          pushToast('error', 'Keep at least one template');
          render();
          return;
        }
        store.updateSettings({ templates });
        return;
      }
      case 'reset-templates':
        store.updateSettings({ templates: [] });
        pushToast('success', 'Templates restored');
        render();
        return;
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
        openModal({ type: 'contact', preset: { company: el.dataset.companyName || '' } });
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
      case 'edit-activity': {
        const activity = store.getById('activities', el.dataset.id);
        openModal(activity && isPlanned(activity) ? { type: 'plan', id: activity.id, draft: {} } : { type: 'activity', id: el.dataset.id });
        render();
        return;
      }
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
      const companies = store.getAll('companies');
      const colleague = peopleAt(companyOf(contact, companies), store.getAll('contacts'), companies).find((person) => person.id !== id);
      const successor = (deal) => stakeholderEntries(deal).find((entry) => entry.contactId !== id)?.contactId;
      const orphaned = store.query('deals', (deal) => deal.contactId === id && !successor(deal));
      ui.confirm = {
        title: 'Delete contact?',
        message: deleteContactMessage(contact?.name || 'this contact', orphaned.length),
        yes: 'Delete',
        onYes: () => {
          for (const deal of store.query('deals', (item) => stakeholderEntries(item).some((entry) => entry.contactId === id))) {
            const next = successor(deal);
            if (!next) {
              store.delete('deals', deal.id);
              continue;
            }
            store.update('deals', deal.id, {
              contactId: deal.contactId === id ? next : deal.contactId,
              stakeholders: stakeholderEntries(deal).filter((entry) => entry.contactId !== id).map(({ contactId, role }) => ({ contactId, role })),
            });
          }
          for (const activity of store.query('activities', (item) => item.contactId === id)) store.delete('activities', activity.id);
          for (const customer of store.query('customers', (item) => item.contactId === id)) {
            if (colleague) {
              store.update('customers', customer.id, { contactId: colleague.id });
              continue;
            }
            for (const order of store.query('orders', (item) => item.customerId === customer.id)) store.delete('orders', order.id);
            store.delete('customers', customer.id);
          }
          store.delete('contacts', id);
          ui.confirm = null;
          pushToast('success', 'Contact deleted');
          go('#/roster');
        },
      };
    } else if (kind === 'company') {
      const company = store.getById('companies', id);
      const companies = store.getAll('companies');
      const people = peopleAt(company, store.getAll('contacts'), companies);
      ui.confirm = {
        title: 'Delete company?',
        message: `Delete ${company?.name || 'this company'}?${people.length ? ` ${people.length === 1 ? 'Its 1 person stays' : `Its ${people.length} people stay`} in your Roster without a company.` : ''} Deals and history are kept.`,
        yes: 'Delete',
        onYes: () => {
          for (const person of people) store.update('contacts', person.id, { companyId: null, company: '' });
          for (const collection of ['deals', 'customers', 'activities']) {
            for (const item of store.query(collection, (record) => record.companyId === id)) store.update(collection, item.id, { companyId: null });
          }
          store.delete('companies', id);
          ui.confirm = null;
          pushToast('success', 'Company deleted');
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
      data.companyId = ensureCompany(store, data.company);
      data.company = data.companyId ? store.getById('companies', data.companyId).name : '';
      if (existing) store.update('contacts', existing.id, data);
      else store.create('contacts', data);
      pushToast('success', existing ? 'Contact updated' : 'Contact saved');
      render();
      return;
    }
    if (modal.type === 'company') {
      const existing = modal.id ? store.getById('companies', modal.id) : null;
      const data = {
        name: read(dialog, 'name').trim().replace(/\s+/g, ' '),
        industry: read(dialog, 'industry').trim(),
        website: read(dialog, 'website').trim(),
        notes: read(dialog, 'notes'),
      };
      const others = store.query('companies', (company) => company.id !== existing?.id);
      const result = validateCompany(data, { companies: others });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      if (existing) {
        store.update('companies', existing.id, data);
        if (existing.name !== data.name) {
          for (const person of store.query('contacts', (contact) => contact.companyId === existing.id)) store.update('contacts', person.id, { company: data.name });
        }
        pushToast('success', 'Company updated');
        render();
        return;
      }
      const company = store.create('companies', data);
      ui.rosterMode = 'companies';
      pushToast('success', `${company.name} added`);
      go(`#/roster?company=${company.id}`);
      return;
    }
    if (modal.type === 'plan') return savePlan(dialog, modal);
    if (modal.type === 'complete') return saveComplete(dialog, modal);
    if (modal.type === 'voice') return saveVoiceNote(dialog, modal);
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
      Object.assign(data, dealPeople(dialog, data.contactId, existing));
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
      const type = existing?.type || modal.activityType || 'call';
      const data = {
        type,
        status: existing?.status || 'done',
        contactId: read(dialog, 'contact'),
        dealId: read(dialog, 'deal') || null,
        title: read(dialog, 'title').trim(),
        description: read(dialog, 'description'),
        date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
        duration: duration === '' ? null : Number(duration),
        outcome: read(dialog, 'outcome'),
      };
      if (dialog.querySelector('[data-field="channel"]')) data.channel = read(dialog, 'channel');
      else if (type === 'whatsapp') data.channel = 'whatsapp';
      const result = validateActivity(data, { contacts: store.getAll('contacts'), deals: store.getAll('deals') });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      data.companyId = companyOf(store.getById('contacts', data.contactId), store.getAll('companies'))?.id ?? null;
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

  function companyIdFor(contactId) {
    return companyOf(store.getById('contacts', contactId), store.getAll('companies'))?.id ?? null;
  }

  function firstName(contactId) {
    return store.getById('contacts', contactId)?.name.split(' ')[0] || 'them';
  }

  function rememberDraft(name, value) {
    if (ui.modal?.draft) ui.modal.draft[name] = value;
  }

  /* ───────────── stakeholders ───────────── */

  /** Primary contact plus ticked colleagues; stakeholders from other companies (not shown as boxes) are kept. */
  function dealPeople(dialog, primaryId, existing) {
    const previous = existing ? stakeholderEntries(existing) : [];
    const roles = new Map(previous.map((entry) => [entry.contactId, entry.role]));
    const boxes = [...dialog.querySelectorAll('[data-stakeholder-option]')].filter((box) => !box.closest('[hidden]'));
    const shown = new Map(boxes.map((box) => [box.value, box.checked]));
    const ids = [primaryId];
    for (const entry of previous) if (!shown.has(entry.contactId) || shown.get(entry.contactId)) ids.push(entry.contactId);
    for (const [id, checked] of shown) if (checked) ids.push(id);
    const unique = [...new Set(ids)].filter((id) => id && store.getById('contacts', id));
    return {
      companyId: companyIdFor(primaryId),
      stakeholders: unique.map((contactId) => ({ contactId, role: roles.get(contactId) || '' })),
    };
  }

  function plainEntries(deal) {
    return stakeholderEntries(deal).map(({ contactId, role }) => ({ contactId, role }));
  }

  function addStakeholder(el) {
    const scope = el.closest('[data-region], [data-panel]') || root;
    const contactId = scope.querySelector('[data-field="addStakeholder"]')?.value || '';
    const role = scope.querySelector('[data-field="addStakeholderRole"]')?.value || '';
    const deal = store.getById('deals', el.dataset.dealRef);
    if (!deal) return;
    if (!contactId) {
      pushToast('error', 'Pick someone to add first');
      render();
      return;
    }
    const entries = plainEntries(deal);
    if (!entries.some((entry) => entry.contactId === contactId)) {
      store.update('deals', deal.id, { stakeholders: [...entries, { contactId, role }] });
    }
    pushToast('success', `${store.getById('contacts', contactId)?.name || 'They'} added to ${deal.title}`);
    render();
  }

  function removeStakeholder(dealId, contactId) {
    const deal = store.getById('deals', dealId);
    if (!deal || deal.contactId === contactId) return;
    const before = plainEntries(deal);
    store.update('deals', dealId, { stakeholders: before.filter((entry) => entry.contactId !== contactId) });
    pushToast('info', `${store.getById('contacts', contactId)?.name || 'Person'} removed from the deal`, {
      label: 'Undo',
      run: () => store.update('deals', dealId, { stakeholders: before }),
    });
    render();
  }

  function makePrimary(dealId, contactId) {
    const deal = store.getById('deals', dealId);
    if (!deal || deal.contactId === contactId) return;
    store.update('deals', dealId, { contactId, stakeholders: plainEntries(deal), companyId: companyIdFor(contactId) || deal.companyId || null });
    pushToast('success', `${store.getById('contacts', contactId)?.name} is now the main contact`);
    render();
  }

  function setStakeholderRole(dealId, contactId, role) {
    const deal = store.getById('deals', dealId);
    if (!deal) return;
    store.update('deals', dealId, { stakeholders: plainEntries(deal).map((entry) => (entry.contactId === contactId ? { ...entry, role } : entry)) });
  }

  function syncStakeholderOptions(dialog) {
    const field = dialog.querySelector('[data-stakeholder-field]');
    const select = dialog.querySelector('[data-field="contact"]');
    if (!field || !select) return;
    const company = select.selectedOptions[0]?.dataset.company || '';
    let any = false;
    field.querySelectorAll('[data-person]').forEach((label) => {
      const show = Boolean(company) && label.dataset.personCompany === company && label.dataset.person !== select.value;
      label.hidden = !show;
      any ||= show;
    });
    field.hidden = !any;
  }

  /* ───────────── next steps ───────────── */

  function openPlan(refs, preset = {}) {
    const { contactId, dealId } = resolveRefs(refs);
    openModal({ type: 'plan', preset: { contactId, dealId: dealId || openDealFor(contactId), ...preset }, draft: {} });
    render();
  }

  function parseDate(dialog) {
    const raw = read(dialog, 'date');
    const parsed = raw ? new Date(raw) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '';
  }

  function savePlan(dialog, modal) {
    const existing = modal.id ? store.getById('activities', modal.id) : null;
    const data = {
      type: dialog.querySelector('[data-plan-type]:checked')?.value || 'meeting',
      status: 'planned',
      contactId: read(dialog, 'contact'),
      dealId: read(dialog, 'deal') || null,
      title: read(dialog, 'title').trim(),
      description: read(dialog, 'description'),
      date: parseDate(dialog),
      duration: existing?.duration ?? null,
      outcome: existing?.outcome || '',
    };
    const result = validateActivity(data, { contacts: store.getAll('contacts'), deals: store.getAll('deals') });
    if (!result.ok) return showFieldErrors(dialog, result.errors);
    ui.modal = null;
    data.companyId = companyIdFor(data.contactId);
    if (existing) store.update('activities', existing.id, data);
    else store.create('activities', data);
    pushToast('success', existing ? 'Next step updated' : `Planned for ${shortDate(data.date)} with ${firstName(data.contactId)}`);
    render();
  }

  function openComplete(id) {
    if (!store.getById('activities', id)) return;
    openModal({ type: 'complete', id, draft: {} });
    render();
  }

  function saveComplete(dialog, modal) {
    const step = store.getById('activities', modal.id);
    if (!step) return;
    const date = parseDate(dialog);
    if (!date) return showFieldErrors(dialog, [{ field: 'date', message: 'Date is required' }]);
    const update = {
      status: 'done',
      completedAt: now().toISOString(),
      date,
      outcome: read(dialog, 'outcome').trim(),
      description: read(dialog, 'description'),
    };
    if (dialog.querySelector('[data-field="duration"]')) {
      const duration = read(dialog, 'duration');
      update.duration = duration === '' ? null : Math.max(0, Number(duration));
    }
    const planNext = dialog.querySelector('[data-field="planNext"]')?.checked;
    store.update('activities', step.id, update);
    pushToast('success', `“${step.title}” done`, {
      label: 'Undo',
      run: () => store.update('activities', step.id, {
        status: 'planned', completedAt: null, date: step.date, outcome: step.outcome || '', description: step.description || '', duration: step.duration ?? null,
      }),
    });
    if (planNext) {
      openPlan({ contactId: step.contactId, dealId: step.dealId || '' });
      return;
    }
    ui.modal = null;
    render();
  }

  function reschedule(id, days) {
    const step = store.getById('activities', id);
    if (!step) return;
    const current = new Date(step.date);
    const today = now();
    const base = current < today
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), current.getHours(), current.getMinutes())
      : current;
    const next = shiftDate(base.toISOString(), days);
    store.update('activities', id, { date: next.toISOString() });
    pushToast('info', `Moved to ${shortDate(next)}`, { label: 'Undo', run: () => store.update('activities', id, { date: step.date }) });
    render();
  }

  /* ───────────── messaging ───────────── */

  function openComposer(refs) {
    const { contactId, dealId, companyId } = resolveRefs(refs);
    openModal({ type: 'message', contactId, dealId: dealId || openDealFor(contactId), companyId, text: '', templateId: '' });
    render();
  }

  function editableTemplates() {
    return templatesFrom(store.getSettings()).map((template) => ({ ...template }));
  }

  function applyTemplate(id) {
    const template = templatesFrom(store.getSettings()).find((item) => item.id === id);
    if (!template || !ui.modal) return;
    ui.modal.text = renderTemplate(template.body, composerContext(context()).vars);
    ui.modal.templateId = id;
    render();
    const area = root.querySelector('.overlay-host [data-field="message"]');
    area?.focus({ preventScroll: true });
    area?.setSelectionRange?.(area.value.length, area.value.length);
  }

  function composedText() {
    if (ui.modal?.type !== 'message') return '';
    return renderTemplate(ui.modal.text || '', composerContext(context()).vars).trim();
  }

  /** Keeps the preview, counter and send links live while typing, without re-rendering the sheet. */
  function updateComposer(dialog) {
    const text = composedText();
    const preview = dialog.querySelector('[data-preview]');
    if (preview) {
      preview.hidden = !text;
      preview.querySelector('[data-preview-text]').textContent = text;
    }
    const count = dialog.querySelector('[data-char-count]');
    if (count) count.textContent = `${text.length} characters`;
    const off = !text || !ui.modal.contactId;
    dialog.querySelector('[data-action="copy-message"]')?.toggleAttribute('disabled', off);
    dialog.querySelectorAll('a[data-action="send-whatsapp"], a[data-action="send-email"]').forEach((link) => link.setAttribute('aria-disabled', off ? 'true' : 'false'));
  }

  function sendMessage(channel, el, event) {
    const modal = ui.modal;
    if (modal?.type !== 'message' || el.hasAttribute('disabled')) return;
    const ctx = context();
    const { contact, deal } = composerContext(ctx);
    const text = composedText();
    if (!text || !contact) {
      event?.preventDefault();
      return;
    }
    const settings = ctx.settings;
    const href = channel === 'whatsapp'
      ? waLink(contact.phone, text, settings.countryCode)
      : mailtoLink(contact.email, deal?.title || 'Following up', text);
    el.setAttribute('href', href);
    if (openUrl) {
      event?.preventDefault();
      openUrl(href);
    }
    const template = templatesFrom(settings).find((item) => item.id === modal.templateId);
    const activity = store.create('activities', {
      type: channel,
      status: 'done',
      channel,
      contactId: contact.id,
      dealId: modal.dealId || null,
      companyId: companyIdFor(contact.id),
      title: template ? `${template.name} · ${channel === 'whatsapp' ? 'WhatsApp' : 'Email'}` : suggestTitle(text),
      description: text,
      date: now().toISOString(),
      duration: null,
      outcome: 'Sent',
    });
    pushToast('success', `${channel === 'whatsapp' ? 'Opening WhatsApp' : 'Opening email'} · saved to the Chronicle`, {
      label: 'Undo',
      run: () => store.delete('activities', activity.id),
    });
    // The link's navigation runs after this handler, so the sheet must stay in the DOM until then.
    setTimeout(() => {
      if (ui.modal !== modal) return;
      ui.modal = null;
      render();
    }, 0);
  }

  function copyText(text, message) {
    const target = clipboard !== undefined ? clipboard : navigator.clipboard;
    if (!target?.writeText) {
      pushToast('error', 'Copying isn’t available in this browser');
      render();
      return;
    }
    Promise.resolve(target.writeText(text)).then(
      () => pushToast('success', message),
      () => pushToast('error', 'Couldn’t copy. Select the text and copy it instead'),
    ).then(() => render());
  }

  /* ───────────── calls ───────────── */

  function openCall(el) {
    const refs = refsOf(el);
    let { contactId } = refs;
    const { dealId, companyId } = refs;
    const contacts = store.getAll('contacts');
    const deal = dealId ? store.getById('deals', dealId) : null;
    if (deal && el.dataset.direct !== 'true') {
      const reachable = stakeholderEntries(deal).map((entry) => store.getById('contacts', entry.contactId)).filter((person) => person?.phone);
      contactId = reachable.length > 1 ? '' : reachable[0]?.id || contactId || deal.contactId;
    } else if (!contactId && companyId) {
      const reachable = peopleAt(store.getById('companies', companyId), contacts, store.getAll('companies')).filter((person) => person.phone);
      contactId = reachable.length === 1 ? reachable[0].id : '';
    }
    openModal({ type: 'call', contactId, dealId: deal ? dealId : '', companyId });
    render();
  }

  function callVia(el, event) {
    const modal = ui.modal;
    if (modal?.type !== 'call' || !modal.contactId) return;
    pendingCall = {
      contactId: modal.contactId,
      dealId: modal.dealId || openDealFor(modal.contactId),
      channel: el.dataset.channel === 'whatsapp' ? 'whatsapp' : 'phone',
      startedAt: Date.now(),
      at: now().toISOString(),
      left: false,
    };
    if (openUrl) {
      event?.preventDefault();
      openUrl(el.getAttribute('href'));
    }
    setTimeout(() => {
      if (ui.modal !== modal) return;
      ui.modal = null;
      render();
    }, 0);
  }

  function onAway() {
    if (pendingCall) pendingCall.left = true;
  }

  /** Back from the dialler or WhatsApp: offer to log the call while it is fresh. */
  function onBack() {
    if (!pendingCall?.left || document.visibilityState === 'hidden') return;
    const call = pendingCall;
    pendingCall = null;
    if (ui.modal || ui.confirm || !store.getById('contacts', call.contactId)) return;
    openModal({
      type: 'activity',
      activityType: 'call',
      returning: true,
      preset: {
        contactId: call.contactId,
        dealId: call.dealId,
        channel: call.channel,
        title: `${call.channel === 'whatsapp' ? 'WhatsApp call' : 'Call'} with ${firstName(call.contactId)}`,
        duration: Math.max(1, Math.round((Date.now() - call.startedAt) / 60000)),
        date: call.at,
      },
    });
    render();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') onAway();
    else onBack();
  }

  /* ───────────── voice notes ───────────── */

  function speech() {
    return speechFactory !== undefined ? speechFactory : browserSpeech(window);
  }

  function openVoice(refs) {
    const { contactId, dealId } = resolveRefs(refs);
    const factory = speech();
    const base = {
      type: 'voice',
      preset: { contactId, dealId: dealId || openDealFor(contactId) },
      startedAt: now().toISOString(),
      draft: {},
      base: '',
      transcript: '',
      interim: '',
      elapsed: 0,
      error: '',
    };
    if (!factory) {
      openModal({ ...base, phase: 'review', supported: false });
      render();
      return;
    }
    openModal({ ...base, phase: 'recording', state: 'listening', supported: true });
    render();
    startDictation(factory);
  }

  function joinText(...parts) {
    return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
  }

  function paintTranscript(modal) {
    const box = root.querySelector('[data-voice-transcript]');
    if (!box) return;
    box.innerHTML = modal.transcript || modal.interim
      ? `<span class="final">${esc(modal.transcript)}</span> <span class="interim">${esc(modal.interim)}</span>`
      : '<span class="placeholder">Your words appear here as you speak.</span>';
    box.scrollTop = box.scrollHeight;
  }

  function startDictation(factory = speech()) {
    const modal = ui.modal;
    const live = () => ui.modal === modal && modal.phase === 'recording';
    dictation = createDictation({
      factory,
      lang: store.getSettings().voiceLang || 'en-IN',
      onChange: ({ final, interim }) => {
        if (!live()) return;
        modal.transcript = joinText(modal.base, final);
        modal.interim = interim;
        paintTranscript(modal);
      },
      onError: (message) => {
        if (ui.modal === modal) modal.error = message;
      },
      onState: (state) => {
        if (!live()) return;
        modal.state = state;
        if (state === 'stopped') finishRecording();
        else render();
      },
    });
    clearInterval(voiceTimer);
    voiceTimer = setInterval(() => {
      if (!live() || modal.state !== 'listening') return;
      modal.elapsed += 1;
      const timer = root.querySelector('[data-voice-timer]');
      if (timer) timer.textContent = formatClock(modal.elapsed);
    }, 1000);
    dictation.start();
    if (!wakeLock && navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then((lock) => {
        if (dictation) wakeLock = lock;
        else lock.release?.();
      }).catch(() => {});
    }
  }

  function endDictation() {
    const current = dictation;
    dictation = null;
    current?.abort();
    clearInterval(voiceTimer);
    voiceTimer = 0;
    Promise.resolve(wakeLock?.release?.()).catch(() => {});
    wakeLock = null;
  }

  function finishRecording() {
    const modal = ui.modal;
    if (modal?.type !== 'voice' || modal.phase !== 'recording') return;
    if (dictation) {
      const { final, interim } = dictation.text;
      modal.transcript = joinText(modal.base, final, interim);
    }
    endDictation();
    modal.phase = 'review';
    modal.interim = '';
    delete modal.draft.description;
    delete modal.draft.title;
    render();
  }

  function resumeRecording() {
    const modal = ui.modal;
    const dialog = root.querySelector('.overlay-host [role="dialog"]');
    if (modal?.type !== 'voice' || !dialog) return;
    modal.base = read(dialog, 'description').trim();
    modal.transcript = modal.base;
    modal.interim = '';
    modal.error = '';
    modal.phase = 'recording';
    modal.state = 'listening';
    render();
    startDictation();
  }

  function saveVoiceNote(dialog, modal) {
    const description = read(dialog, 'description').trim();
    const data = {
      type: 'note',
      status: 'done',
      source: modal.supported === false ? 'typed' : 'voice',
      durationSec: modal.elapsed || 0,
      contactId: read(dialog, 'contact'),
      dealId: read(dialog, 'deal') || null,
      title: read(dialog, 'title').trim() || suggestTitle(description),
      description,
      date: modal.startedAt,
      duration: null,
      outcome: '',
    };
    const result = validateActivity(data, { contacts: store.getAll('contacts'), deals: store.getAll('deals') });
    const errors = description ? result.errors : [{ field: 'description', message: 'Say or type something first' }, ...result.errors];
    if (errors.length) return showFieldErrors(dialog, errors);
    data.companyId = companyIdFor(data.contactId);
    const planNext = dialog.querySelector('[data-field="planNext"]')?.checked;
    const note = store.create('activities', data);
    pushToast('success', `Note saved for ${firstName(data.contactId)}`, { label: 'Undo', run: () => store.delete('activities', note.id) });
    if (planNext) {
      openPlan({ contactId: data.contactId, dealId: data.dealId || '' });
      return;
    }
    ui.modal = null;
    render();
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
      syncStakeholderOptions(dialog);
      rememberDraft(select.dataset.field, select.value);
      clearFieldError(dialog, select.dataset.field);
    }
  }

  function syncDealOptions(dialog) {
    const dealSelect = dialog.querySelector('[data-field="deal"]');
    if (!dealSelect) return;
    const contactId = read(dialog, 'contact');
    const company = dialog.querySelector('[data-field="contact"]')?.selectedOptions?.[0]?.dataset.company || '';
    for (const option of dealSelect.options) {
      if (!option.value) continue;
      const people = (option.dataset.people || option.dataset.contact || '').split(' ');
      const mismatch = Boolean(contactId) && !people.includes(contactId) && !(company && option.dataset.company === company);
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
      if (ui.modal?.type === 'message' && el.dataset.field === 'message') {
        ui.modal.text = el.value;
        updateComposer(dialog);
      } else if (SHEET_TYPES.includes(ui.modal?.type) && el.dataset.field && el.type !== 'checkbox') {
        rememberDraft(el.dataset.field, el.value);
      }
      if (ui.modal?.type === 'contact' && el.dataset.field === 'company') {
        const hint = dialog.querySelector('[data-company-hint]');
        if (hint) hint.innerHTML = companyHint(el.value, store.getAll('companies'));
      }
      return;
    }
    if (el.dataset.field === 'countryCode') {
      store.updateSettings({ countryCode: el.value.trim() });
      return;
    }
    if (el.dataset.templateName != null || el.dataset.templateBody != null) {
      const index = Number(el.dataset.templateName ?? el.dataset.templateBody);
      const templates = editableTemplates();
      if (!templates[index]) return;
      templates[index][el.dataset.templateName != null ? 'name' : 'body'] = el.value;
      store.updateSettings({ templates });
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
    const dialog = el.closest('[role="dialog"]');
    if (dialog) {
      if (field === 'contact' && (ui.modal?.type === 'message' || ui.modal?.type === 'call')) {
        ui.modal.contactId = el.value;
        if (ui.modal.type === 'message' && !ui.modal.dealId) ui.modal.dealId = openDealFor(el.value);
        render();
        return;
      }
      if (field === 'contact') {
        syncDealOptions(dialog);
        syncStakeholderOptions(dialog);
      }
      if (SHEET_TYPES.includes(ui.modal?.type)) {
        if (el.matches('[data-plan-type]')) {
          rememberDraft('planType', el.value);
          render();
          return;
        }
        if (field) rememberDraft(field, el.type === 'checkbox' ? el.checked : el.value);
        if (field === 'contact') rememberDraft('deal', read(dialog, 'deal'));
      }
      return;
    }
    if (el.dataset.stakeholderRole) {
      setStakeholderRole(el.dataset.dealRef, el.dataset.stakeholderRole, el.value);
      return;
    }
    if (field === 'voiceLang') {
      store.updateSettings({ voiceLang: el.value });
      return;
    }
    if (field === 'countryCode') return;
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
      return;
    }
    if (action.type === 'voice') {
      event.preventDefault();
      openVoice(routePreset());
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
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onAway);
    window.addEventListener('focus', onBack);
    const onStore = () => render();
    store.subscribe(onStore);
    stopPrevious = () => {
      alive = false;
      endDictation();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onAway);
      window.removeEventListener('focus', onBack);
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
