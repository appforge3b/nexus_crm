import { Store } from './store.js';
import { parseRoute } from './router.js';
import { shortcutAction } from './keyboard.js';
import { debounce } from './debounce.js';
import { renderApp } from './views.js';
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
import { exportFilename } from './format.js';
import { createParticles, stepParticle } from './particles.js';

let stopPrevious = () => {};

export function createApp({ root, storage, clock, seed = false }) {
  const store = new Store({ storage, clock, seed });
  const ui = {
    collapsed: false,
    menuOpen: false,
    modal: null,
    confirm: null,
    help: false,
    celebrate: false,
    toasts: [],
    showLost: false,
    filters: { search: '', minValue: '', maxValue: '', priorities: [] },
    rosterQuery: '',
    rosterDraft: '',
    rosterStatus: 'all',
    customerQuery: '',
    chronicleType: 'all',
    chronicleLimit: 20,
    radarRange: 'this-month',
    customerTab: 'orders',
    selectedCustomerId: null,
    tagError: '',
    importJson: '',
  };

  let painted = false;
  let alive = true;
  let timelineObserver = null;
  let particlesStarted = false;

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

  function render() {
    if (!alive || !root) return;
    const markup = renderApp(context());
    const template = document.createElement('template');
    template.innerHTML = markup;
    if (!painted) {
      root.replaceChildren(...template.content.childNodes);
      painted = true;
    } else {
      const current = root.querySelector('[data-view]');
      const next = template.content.querySelector('[data-view]');
      if (current && next && current.dataset.view === next.dataset.view) current.innerHTML = next.innerHTML;
      else if (current && next) current.replaceWith(next);
      const sidebar = root.querySelector('[data-sidebar]');
      if (sidebar) {
        sidebar.dataset.collapsed = ui.collapsed ? 'true' : 'false';
        sidebar.dataset.open = ui.menuOpen ? 'true' : 'false';
        markCurrent(sidebar);
        markCurrent(root.querySelector('[data-bottom-nav]'));
      }
      for (const selector of ['[data-overlay]', '[data-celebration]', '.toasts']) {
        root.querySelectorAll(selector).forEach((node) => node.remove());
        template.content.querySelectorAll(selector).forEach((node) => root.append(node));
      }
    }
    bindSentinel();
    paint();
  }

  function markCurrent(nav) {
    if (!nav) return;
    const view = parseRoute(window.location.hash).view;
    nav.querySelectorAll('a[href]').forEach((link) => {
      const id = link.getAttribute('href').replace(/^#\//, '').split('?')[0];
      if (id === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function bindSentinel() {
    timelineObserver?.disconnect();
    timelineObserver = null;
    const sentinel = root.querySelector('[data-timeline-sentinel]');
    if (!sentinel || typeof IntersectionObserver !== 'function') return;
    timelineObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      ui.chronicleLimit += 20;
      render();
    });
    timelineObserver.observe(sentinel);
  }

  function paint() {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
    root.querySelectorAll('canvas[data-chart], canvas[data-sparkline]').forEach((canvas) => {
      const ctx = canvas.getContext?.('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
      ctx.strokeRect(8, 8, Math.max(canvas.width - 16, 0), Math.max(canvas.height - 16, 0));
    });
    if (particlesStarted) return;
    const field = root.querySelector('canvas[data-particle-field]');
    const ctx = field?.getContext?.('2d');
    if (!ctx) return;
    particlesStarted = true;
    const particles = createParticles({ width: field.width || 800, height: field.height || 600 });
    const loop = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, field.width, field.height);
      const bounds = {
        width: Math.max(field.width || 800, 1),
        height: Math.max(field.height || 600, 1),
      };
      for (let index = 0; index < particles.length; index += 1) {
        particles[index] = stepParticle(particles[index], bounds, null);
        const particle = particles[index];
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame(loop);
    };
    const frame = window.requestAnimationFrame?.bind(window);
    if (frame) frame(loop);
  }

  function go(hash) {
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
      ui.modal = null;
      ui.celebrate = false;
      render();
      return;
    }
    const route = parseRoute(window.location.hash);
    if (route.params.deal || route.params.contact) go(`#/${route.view}`);
  }

  function showFieldErrors(scope, errors) {
    for (const error of errors) {
      let node = scope.querySelector(`[data-error-for="${error.field}"]`);
      if (!node) {
        node = document.createElement('p');
        node.className = 'field-error';
        node.setAttribute('data-error-for', error.field);
        const input = scope.querySelector(`[data-field="${error.field}"]`);
        (input?.closest('label') || scope).append(node);
      }
      node.textContent = error.message;
    }
  }

  function read(scope, name) {
    return scope.querySelector(`[data-field="${name}"]`)?.value ?? '';
  }

  function routePreset() {
    const route = parseRoute(window.location.hash);
    return { contactId: route.params.contact || '', dealId: route.params.deal || '' };
  }

  function openActivity(type) {
    const preset = routePreset();
    ui.modal = { type: 'activity', activityType: type || 'call', preset };
    render();
  }

  function onClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (event.target?.hasAttribute?.('data-overlay')) {
      closeTop();
      return;
    }
    if (event.target.closest('[aria-label="Collapse sidebar"]')) {
      ui.collapsed = !ui.collapsed;
      render();
      return;
    }
    if (event.target.closest('[aria-label="Open menu"]')) {
      ui.menuOpen = true;
      render();
      return;
    }
    if (actionEl) {
      handleAction(actionEl);
      return;
    }
    const linked = event.target.closest('[data-link]');
    if (linked) {
      if (linked.dataset.link === 'contact') go(`#/roster?contact=${linked.dataset.id}`);
      if (linked.dataset.link === 'deal') go(`#/pipeline?deal=${linked.dataset.id}`);
      return;
    }
    const logged = event.target.closest('[data-log]');
    if (logged) {
      openActivity(logged.dataset.log);
      return;
    }
    const filterType = event.target.closest('[data-filter-type]');
    if (filterType) {
      ui.chronicleType = filterType.dataset.filterType;
      ui.chronicleLimit = 20;
      render();
      return;
    }
    const range = event.target.closest('[data-range]');
    if (range) {
      ui.radarRange = range.dataset.range;
      render();
      return;
    }
    const statusTab = event.target.closest('[data-status-tab]');
    if (statusTab) {
      ui.rosterStatus = statusTab.dataset.statusTab;
      render();
      return;
    }
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      ui.customerTab = tab.dataset.tab;
      render();
      return;
    }
    const star = event.target.closest('[data-rating]');
    if (star && ui.selectedCustomerId) {
      store.update('customers', ui.selectedCustomerId, { satisfactionRating: Number(star.dataset.rating) });
      return;
    }
    const anchor = event.target.closest('a[href^="#/"]');
    if (anchor) {
      event.preventDefault();
      go(anchor.getAttribute('href'));
      return;
    }
    const priority = event.target.closest('[data-priority-id]');
    if (priority) {
      go(`#/pipeline?deal=${priority.dataset.priorityId}`);
      return;
    }
    const feed = event.target.closest('[data-view="briefing"] [data-activity-id]');
    if (feed) {
      go(`#/chronicle?contact=${feed.dataset.contactId}`);
      return;
    }
    const deal = event.target.closest('[data-deal-id]');
    if (deal && !event.target.closest('button')) {
      go(`#/pipeline?deal=${deal.dataset.dealId}`);
      return;
    }
    const contact = event.target.closest('[data-contact-id]');
    if (contact && !event.target.closest('button, a')) {
      go(`#/roster?contact=${contact.dataset.contactId}`);
      return;
    }
    const customer = event.target.closest('button[data-customer-id]');
    if (customer) {
      ui.selectedCustomerId = customer.dataset.customerId;
      render();
    }
  }

  function handleAction(el) {
    const action = el.dataset.action;
    if (action === 'save-modal') return saveModal();
    if (action === 'cancel-modal' || action === 'convert-no') {
      if (ui.modal?.type === 'convert') confirmConversion(store, ui.modal.dealId, false, { now: now() });
      ui.modal = null;
      ui.help = false;
      ui.celebrate = false;
      render();
      return;
    }
    if (action === 'confirm-no') {
      ui.confirm = null;
      render();
      return;
    }
    if (action === 'confirm-yes') {
      const run = ui.confirm?.onYes;
      ui.confirm = null;
      run?.();
      return;
    }
    if (action === 'convert-yes') {
      const dealId = ui.modal?.dealId;
      ui.modal = null;
      ui.celebrate = false;
      confirmConversion(store, dealId, true, { now: now() });
      pushToast('success', 'Customer created');
      render();
      return;
    }
    if (action === 'dismiss-toast') {
      const id = el.dataset.toast;
      const toast = ui.toasts.find((item) => item.id === id);
      clearTimeout(toast?.timer);
      ui.toasts = ui.toasts.filter((item) => item.id !== id);
      render();
      return;
    }
    if (action === 'new-contact') {
      ui.modal = { type: 'contact' };
      render();
      return;
    }
    if (action === 'new-deal') {
      ui.modal = { type: 'deal', preset: { contactId: el.dataset.contactId || routePreset().contactId || '' } };
      render();
      return;
    }
    if (action === 'new-order') {
      ui.modal = { type: 'order', customerId: ui.selectedCustomerId };
      render();
      return;
    }
    if (action === 'quick-log' || action === 'log') {
      openActivity(el.dataset.log || el.dataset.logType);
      return;
    }
    if (action === 'toggle-lost') {
      ui.showLost = !ui.showLost;
      render();
      return;
    }
    if (action === 'clear-search') {
      ui.filters.search = '';
      render();
      return;
    }
    if (action === 'delete') return askDelete(el.dataset.kind, el.dataset.id);
    if (action === 'add-tag') return addTag();
    if (action === 'export') return exportBackup();
    if (action === 'replace-import') {
      const json = ui.importJson;
      ui.modal = null;
      store.importAll(json);
      render();
      return;
    }
    if (action === 'reset-demo') {
      ui.confirm = {
        message: 'Replace everything with demo data? This cannot be undone.',
        yes: 'Reset',
        onYes: () => {
          store.resetDemo();
          ui.confirm = null;
          render();
        },
      };
      render();
      return;
    }
    if (action === 'clear-all') {
      ui.confirm = {
        message: 'Clear all data? This cannot be undone.',
        yes: 'Clear data',
        onYes: () => {
          ui.confirm = {
            message: 'Are you sure? This will erase every contact, deal, and note.',
            yes: 'Clear data',
            onYes: () => {
              store.clearAll();
              ui.selectedCustomerId = null;
              ui.confirm = null;
              render();
            },
          };
          render();
        },
      };
      render();
    }
  }

  function askDelete(kind, id) {
    if (kind === 'deal') {
      const deal = store.getById('deals', id);
      ui.confirm = {
        message: deleteDealMessage(deal?.title || 'this deal'),
        yes: 'Delete',
        onYes: () => {
          store.delete('deals', id);
          ui.confirm = null;
          go('#/pipeline');
        },
      };
    } else if (kind === 'contact') {
      const contact = store.getById('contacts', id);
      const dealCount = store.query('deals', (deal) => deal.contactId === id).length;
      ui.confirm = {
        message: deleteContactMessage(contact?.name || 'this contact', dealCount),
        yes: 'Delete',
        onYes: () => {
          for (const deal of store.query('deals', (item) => item.contactId === id)) store.delete('deals', deal.id);
          for (const activity of store.query('activities', (item) => item.contactId === id)) store.delete('activities', activity.id);
          store.delete('contacts', id);
          ui.confirm = null;
          go('#/roster');
        },
      };
    } else if (kind === 'activity') {
      const activity = store.getById('activities', id);
      ui.confirm = {
        message: `Delete ${activity?.title || 'this activity'}? This cannot be undone.`,
        yes: 'Delete',
        onYes: () => {
          store.delete('activities', id);
          ui.confirm = null;
          render();
        },
      };
    }
    render();
  }

  function saveModal() {
    const dialog = root.querySelector('[role="dialog"]');
    const modal = ui.modal;
    if (!dialog || !modal) return;
    if (modal.type === 'contact') {
      const data = {
        name: read(dialog, 'name').trim(),
        email: read(dialog, 'email').trim(),
        phone: read(dialog, 'phone').trim(),
        company: read(dialog, 'company').trim(),
        title: read(dialog, 'title').trim(),
        tags: [],
        notes: read(dialog, 'notes'),
        status: 'prospect',
        source: read(dialog, 'source').trim(),
      };
      const result = validateContact(data, { tags: store.getAll('tags') });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      store.create('contacts', data);
      pushToast('success', 'Contact saved');
      render();
      return;
    }
    if (modal.type === 'deal') {
      const stage = read(dialog, 'stage') || 'prospect';
      const data = {
        title: read(dialog, 'title').trim(),
        contactId: read(dialog, 'contact'),
        value: Number(read(dialog, 'value')),
        stage,
        priority: read(dialog, 'priority') || 'medium',
        probability: STAGE_PROBABILITY[stage] ?? 10,
        expectedCloseDate: read(dialog, 'expectedCloseDate'),
        notes: read(dialog, 'notes'),
        lostReason: '',
        stageChangedAt: now().toISOString(),
      };
      const result = validateDeal(data, { contacts: store.getAll('contacts') });
      if (!result.ok) {
        return showFieldErrors(dialog, result.errors.map((error) => (
          error.field === 'contactId' ? { ...error, field: 'contact' } : error
        )));
      }
      ui.modal = null;
      store.create('deals', data);
      pushToast('success', 'Deal created');
      render();
      return;
    }
    if (modal.type === 'activity') {
      const duration = read(dialog, 'duration');
      const data = {
        type: modal.activityType || 'call',
        contactId: read(dialog, 'contact'),
        dealId: read(dialog, 'deal') || null,
        title: read(dialog, 'title').trim(),
        description: read(dialog, 'description'),
        date: read(dialog, 'date') || now().toISOString(),
        duration: duration === '' ? null : Number(duration),
        outcome: read(dialog, 'outcome'),
      };
      const result = validateActivity(data, { contacts: store.getAll('contacts'), deals: store.getAll('deals') });
      if (!result.ok) return showFieldErrors(dialog, result.errors);
      ui.modal = null;
      store.create('activities', data);
      pushToast('success', 'Activity logged');
      render();
      return;
    }
    if (modal.type === 'order') {
      const data = {
        customerId: modal.customerId || ui.selectedCustomerId,
        description: read(dialog, 'description').trim(),
        amount: Number(read(dialog, 'amount')),
        status: read(dialog, 'status') || 'pending',
        date: read(dialog, 'date'),
        notes: read(dialog, 'notes'),
      };
      const result = validateOrder(data);
      if (!result.ok) return showFieldErrors(dialog, result.errors);
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
      moveDeal(store, modal.dealId, 'lost', { now: now(), lostReason });
      ui.showLost = true;
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
  }

  function exportBackup() {
    const link = document.createElement('a');
    link.download = exportFilename(now());
    link.dataset.export = store.exportAll();
    link.href = '#';
    document.body.appendChild(link);
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
    ui.modal = {
      type: 'import',
      preview: importPreviewText({
        contacts: parsed.contacts.length,
        deals: parsed.deals.length,
        activities: parsed.activities.length,
        customers: parsed.customers.length,
        orders: parsed.orders.length,
        tags: parsed.tags.length,
      }),
    };
    render();
  }

  function onInput(event) {
    const el = event.target;
    if (el.closest('[role="dialog"], [role="alertdialog"]')) return;
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
    if (el.dataset.field === 'import' && el.files?.[0]) {
      loadImport(el.files[0]);
      return;
    }
    if (el.name === 'priority') {
      const selected = new Set(ui.filters.priorities);
      if (el.checked) selected.add(el.value);
      else selected.delete(el.value);
      ui.filters.priorities = [...selected];
      render();
    }
  }

  function onDragStart(event) {
    const card = event.target.closest('[data-deal-id]');
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', card.dataset.dealId);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event) {
    if (event.target.closest('[data-stage]')) event.preventDefault();
  }

  function onDrop(event) {
    const column = event.target.closest('[data-stage]');
    if (!column || !event.dataTransfer) return;
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const stage = column.dataset.stage;
    const result = moveDeal(store, id, stage, { now: now() });
    if (result.needsConfirmation) {
      ui.confirm = {
        message: backwardMoveMessage(stageLabel(store.getSettings(), stage)),
        yes: 'Move',
        onYes: () => {
          ui.confirm = null;
          moveDeal(store, id, stage, { now: now(), confirm: true });
          render();
        },
      };
      render();
      return;
    }
    if (result.needsLostReason) {
      ui.modal = { type: 'lost', dealId: id };
      render();
      return;
    }
    if (result.celebrate) {
      ui.celebrate = true;
      if (result.askConversion) {
        const deal = store.getById('deals', id);
        const contact = deal ? store.getById('contacts', deal.contactId) : null;
        ui.modal = { type: 'convert', dealId: id, name: contact?.name || 'this contact' };
      }
      render();
    }
  }

  function onBlur(event) {
    const notes = event.target?.closest?.('[data-notes]');
    if (!notes) return;
    saveNotes(ui.selectedCustomerId, notes.value);
  }

  function onKey(event) {
    const action = shortcutAction(event);
    if (!action) return;
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
      root.querySelector('[data-view] [data-search]')?.focus();
      return;
    }
    if (action.type === 'help') {
      ui.help = true;
      render();
      return;
    }
    if (action.type === 'create') {
      const view = parseRoute(window.location.hash).view;
      if (view === 'pipeline' || view === 'briefing') ui.modal = { type: 'deal' };
      else if (view === 'chronicle') ui.modal = { type: 'activity', activityType: 'call', preset: {} };
      else if (view === 'customers') ui.modal = { type: 'order', customerId: ui.selectedCustomerId };
      else ui.modal = { type: 'contact' };
      render();
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
    const onStore = () => render();
    store.subscribe(onStore);
    stopPrevious = () => {
      alive = false;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
      timelineObserver?.disconnect();
      for (const toast of ui.toasts) clearTimeout(toast.timer);
      store.unsubscribe(onStore);
    };
    render();
  }

  return { store, start };
}
