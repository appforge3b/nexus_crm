import { ACTIVE_STAGES, STAGES } from './stages.js';
import { stageLabel } from './settings.js';
import {
  avatarGradient,
  calendarKey,
  formatLongDate,
  formatMediumDate,
  formatMoney,
  formatMoneyCompact,
  formatRelativeTime,
  greetingForHour,
  initials,
  stageAgeDays,
  stageAgeTone,
  truncate,
} from './format.js';
import { listPriorities } from './priority.js';
import { relationshipStrength } from './relationship.js';
import { buildKpis, closingSummary, presetRange } from './metrics.js';
import { filterActivities, filterContacts, filterCustomers, filterDeals } from './filters.js';
import { customerStats, openDealsForContact } from './customers.js';
import { winLossModel } from './charts.js';
import { IMPORT_WARNING, conversionMessage } from './copy.js';
import { LOST_REASONS } from './stages.js';
import { NAV, esc, icon } from './markup.js';
import { renderNotes } from './markdown.js';

function money(amount, currency, compact = false) {
  return compact ? formatMoneyCompact(amount, currency) : formatMoney(amount, currency);
}

function trend(item) {
  if (!item) return '';
  const arrow = item.direction === 'up' ? '▲' : item.direction === 'down' ? '▼' : '';
  return `<span class="trend-${item.direction}">${arrow} ${esc(item.label)}</span>`;
}

function fieldError(errors, name) {
  return errors?.[name] ? `<p class="field-error" data-error-for="${name}">${esc(errors[name])}</p>` : '';
}

function contactById(contacts, id) {
  return contacts.find((contact) => contact.id === id) ?? null;
}

export function renderApp(ctx) {
  const { route, settings, ui } = ctx;
  const currency = settings.currency || '₹';
  return `
    <canvas data-particle-field></canvas>
    <div class="shell">
      <nav data-sidebar data-collapsed="${ui.collapsed ? 'true' : 'false'}" data-open="${ui.menuOpen ? 'true' : 'false'}">
        <div class="wordmark">NEXUS</div>
        ${NAV.map(([id, label, href]) => `
          <a href="${href}" ${route.view === id ? 'aria-current="page"' : ''}>${icon()}<span class="nav-label">${label}</span></a>
        `).join('')}
        <div class="sidebar-actions">
          <a href="#/settings" ${route.view === 'settings' ? 'aria-current="page"' : ''}>${icon()}<span class="nav-label">Settings</span></a>
          <button type="button" aria-label="Collapse sidebar">Collapse</button>
          <button type="button" aria-label="Open menu">Menu</button>
        </div>
      </nav>
      <main class="workspace">
        ${renderView(ctx, currency)}
      </main>
      <nav data-bottom-nav>
        ${NAV.map(([id, label, href]) => `<a href="${href}" ${route.view === id ? 'aria-current="page"' : ''}>${icon()}<span>${label}</span></a>`).join('')}
      </nav>
    </div>
    ${renderOverlay(ctx)}
    <div class="toasts">
      ${ui.toasts.map((toast) => `
        <div class="toast" role="status" data-tone="${toast.tone}" data-toast="${toast.id}">
          <span>${esc(toast.message)}</span>
          <button type="button" aria-label="Dismiss" data-action="dismiss-toast" data-toast="${toast.id}">×</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderView(ctx, currency) {
  switch (ctx.route.view) {
    case 'pipeline': return renderPipeline(ctx, currency);
    case 'roster': return renderRoster(ctx, currency);
    case 'chronicle': return renderChronicle(ctx);
    case 'radar': return renderRadar(ctx, currency);
    case 'customers': return renderCustomers(ctx, currency);
    case 'settings': return renderSettings(ctx);
    default: return renderBriefing(ctx, currency);
  }
}

function renderBriefing(ctx, currency) {
  const { contacts, deals, activities, settings, now } = ctx;
  const kpis = buildKpis(deals, now, currency);
  const priorities = listPriorities({ deals, activities, contacts, now });
  const feed = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const hour = now.getHours();
  return `
    <section data-view="briefing">
      <header class="view-header">
        <div>
          <h1>${esc(greetingForHour(hour))}, ${esc(settings.userName || 'there')}</h1>
          <p class="secondary">${esc(formatLongDate(now))}</p>
          <p>${esc(closingSummary(deals, now, currency))}</p>
        </div>
      </header>
      <div class="kpi-row" data-region="kpis">
        <article class="kpi glass" data-kpi="pipeline"><span>Pipeline Value</span><strong>${esc(kpis.pipeline.formattedValue)}</strong><span>${kpis.pipeline.count} deals</span>${trend(kpis.pipeline.trend)}</article>
        <article class="kpi glass" data-kpi="won"><span>Won This Month</span><strong>${esc(kpis.won.formattedValue)}</strong><span>${kpis.won.count} deals</span>${trend(kpis.won.trend)}</article>
        <article class="kpi glass" data-kpi="conversion"><span>Conversion Rate</span><strong>${esc(kpis.conversion.formattedRate)}</strong><span>this month</span>${trend(kpis.conversion.trend)}</article>
      </div>
      <div class="briefing-grid">
        <section class="panel glass" data-region="priorities">
          <h2>Today's Priorities</h2>
          ${priorities.length ? priorities.map((item) => `
            <button type="button" class="priority" data-priority-id="${esc(item.deal.id)}">
              <span class="urgency ${item.urgency === 'critical' ? 'pulse-critical' : ''}" data-urgency="${item.urgency}"></span>
              <span>${esc(item.contact?.name || 'Unknown')} ${esc(money(item.deal.value, currency, true))}</span>
              <span>${esc(item.primaryReason)}</span>
            </button>
          `).join('') : '<p>Nothing urgent right now.</p>'}
        </section>
        <section class="panel glass" data-region="forecast">
          <h2>Revenue Forecast</h2>
          <canvas data-chart="forecast" width="640" height="240"></canvas>
        </section>
      </div>
      <section class="panel glass" data-region="activity-feed">
        <h2>Activity Feed</h2>
        ${feed.length ? feed.map((activity) => {
          const contact = contactById(contacts, activity.contactId);
          return `<button type="button" class="feed-item" data-activity-id="${esc(activity.id)}" data-contact-id="${esc(activity.contactId)}"><span>${esc(activity.title)}</span><span>${esc(contact?.name || '')}</span><span>${esc(formatRelativeTime(activity.date, now))}</span></button>`;
        }).join('') : '<p>No activity yet.</p>'}
      </section>
    </section>
  `;
}

function renderPipeline(ctx, currency) {
  const { contacts, deals, activities, settings, now, ui, route } = ctx;
  const filtered = filterDeals(deals, contacts, {
    search: ui.filters.search,
    minValue: ui.filters.minValue,
    maxValue: ui.filters.maxValue,
    priorities: ui.filters.priorities,
  });
  const stages = STAGES.filter((stage) => stage !== 'lost' || ui.showLost);
  const panel = route.params.deal ? renderDealPanel(ctx, route.params.deal, currency) : '';
  return `
    <section data-view="pipeline">
      <header class="view-header">
        <h1>The Pipeline</h1>
        <button type="button" class="primary" data-action="new-deal">New Deal</button>
      </header>
      <div class="toolbar">
        <input data-search placeholder="Search deals" value="${esc(ui.filters.search)}">
        <label>Min <input data-field="minValue" type="number" value="${esc(ui.filters.minValue)}"></label>
        <label>Max <input data-field="maxValue" type="number" value="${esc(ui.filters.maxValue)}"></label>
        ${['critical', 'high', 'medium', 'low'].map((priority) => `
          <label><input type="checkbox" name="priority" value="${priority}" ${ui.filters.priorities.includes(priority) ? 'checked' : ''}> ${priority}</label>
        `).join('')}
        <button type="button" data-action="toggle-lost">${ui.showLost ? 'Hide lost' : 'Lost'}</button>
      </div>
      ${ui.filters.search ? `<span data-filter-chip>${esc(ui.filters.search)} <button type="button" data-action="clear-search">×</button></span>` : ''}
      <div data-stage-pager>${STAGES.filter((stage) => stage !== 'lost').map((stage) => `<span>${esc(stageLabel(settings, stage).toUpperCase())}</span>`).join('')}</div>
      <div class="board">
        ${stages.map((stage) => {
          const columnDeals = filtered.filter((deal) => deal.stage === stage);
          const total = columnDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
          return `
            <section class="stage glass" data-stage="${stage}" ${stage === 'won' ? 'data-highlight="won"' : ''}>
              <header><strong>${esc(stageLabel(settings, stage).toUpperCase())}</strong><span>${columnDeals.length}</span><span>${esc(money(total, currency, true))}</span></header>
              ${columnDeals.map((deal) => renderDealCard(deal, ctx, currency)).join('')}
            </section>
          `;
        }).join('')}
      </div>
      ${panel}
    </section>
  `;
}

function renderDealCard(deal, ctx, currency) {
  const contact = contactById(ctx.contacts, deal.contactId);
  const related = ctx.activities.filter((activity) => activity.dealId === deal.id || activity.contactId === deal.contactId);
  const latest = related.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const age = stageAgeDays(deal.stageChangedAt, ctx.now);
  return `
    <article class="deal-card card" draggable="true" data-deal-id="${esc(deal.id)}" data-swipe-actions>
      <div class="avatar" style="background:${avatarGradient(contact?.name || deal.title)}">${esc(initials(contact?.name || '?'))}</div>
      <strong>${esc(truncate(deal.title, 30))}</strong>
      <div class="secondary">${esc(contact?.company || '')}</div>
      <div>${esc(money(deal.value, currency))}</div>
      <div class="age" data-age-tone="${stageAgeTone(age)}"></div>
      <div class="secondary">${latest ? esc(formatRelativeTime(latest.date, ctx.now)) : 'No activity'}</div>
      <span class="urgency ${deal.priority === 'critical' ? 'pulse-critical' : ''}" data-urgency="${esc(deal.priority)}"></span>
    </article>
  `;
}

function renderDealPanel(ctx, dealId, currency) {
  const deal = ctx.deals.find((item) => item.id === dealId);
  if (!deal) return '';
  const contact = contactById(ctx.contacts, deal.contactId);
  const timeline = ctx.activities.filter((activity) => activity.dealId === deal.id).slice(0, 10);
  return `
    <aside class="drawer" data-panel="deal">
      <h2>${esc(deal.title)}</h2>
      <p>${esc(money(deal.value, currency))} · ${esc(stageLabel(ctx.settings, deal.stage))}</p>
      <p>${esc(contact?.name || '')}</p>
      <p>${esc(contact?.email || '')}</p>
      <p>${esc(contact?.phone || '')}</p>
      <p>${esc(contact?.company || '')}</p>
      ${timeline.map((activity) => `<p>${esc(activity.title)}</p>`).join('')}
      <button type="button" data-action="log" data-log-type="call">Log Call</button>
      <button type="button" data-action="log" data-log-type="email">Log Email</button>
      <button type="button" data-action="log" data-log-type="meeting">Log Meeting</button>
      <button type="button" data-action="log" data-log-type="note">Add Note</button>
      <button type="button" data-action="edit-deal" data-id="${esc(deal.id)}">Edit</button>
      <button type="button" data-action="delete" data-kind="deal" data-id="${esc(deal.id)}">Delete</button>
    </aside>
  `;
}

function renderRoster(ctx, currency) {
  const { contacts, deals, activities, customers, tags, now, ui, route } = ctx;
  const visible = filterContacts(contacts, { query: ui.rosterQuery, status: ui.rosterStatus });
  const counts = {
    all: contacts.length,
    prospect: contacts.filter((contact) => contact.status === 'prospect').length,
    customer: contacts.filter((contact) => contact.status === 'customer').length,
    inactive: contacts.filter((contact) => contact.status === 'inactive').length,
  };
  const panel = route.params.contact ? renderContactPanel(ctx, route.params.contact, currency) : '';
  return `
    <section data-view="roster">
      <header class="view-header">
        <h1>Contacts</h1>
        <button type="button" class="primary" data-action="new-contact">Add Contact</button>
      </header>
      <div class="toolbar">
        <input data-search placeholder="Search contacts..." value="${esc(ui.rosterDraft)}">
        <div class="tabs">
          <button type="button" data-status-tab="all">All ${counts.all}</button>
          <button type="button" data-status-tab="prospect">Prospects ${counts.prospect}</button>
          <button type="button" data-status-tab="customer">Customers ${counts.customer}</button>
          <button type="button" data-status-tab="inactive">Inactive ${counts.inactive}</button>
        </div>
      </div>
      <div class="contact-grid">
        ${visible.map((contact) => renderContactCard(contact, ctx, currency)).join('')}
      </div>
      ${panel}
    </section>
  `;
}

function renderContactCard(contact, ctx, currency) {
  const { deals, activities, customers, tags, now } = ctx;
  const strength = relationshipStrength(contact, { activities, deals, customers, now });
  const active = deals.filter((deal) => deal.contactId === contact.id && ACTIVE_STAGES.includes(deal.stage));
  const activeValue = active.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const wonValue = deals.filter((deal) => deal.contactId === contact.id && deal.stage === 'won').reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const mine = activities.filter((activity) => activity.contactId === contact.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const tagObjects = (contact.tags || []).map((id) => tags.find((tag) => tag.id === id)).filter(Boolean);
  const shown = tagObjects.slice(0, 3);
  const extra = tagObjects.length - shown.length;
  const role = [contact.title, contact.company].filter(Boolean).join(' at ');
  return `
    <article class="contact-card card" data-contact-id="${esc(contact.id)}">
      <div class="avatar lg" style="background:${avatarGradient(contact.name)}">${esc(initials(contact.name))}</div>
      <strong>${esc(contact.name)}</strong>
      <div class="secondary">${esc(role)}</div>
      <div>Relationship Strength</div>
      <div class="strength" data-strength="${strength.score}"><span style="width:${strength.score}%"></span></div>
      <div>${active.length} active ${active.length === 1 ? 'deal' : 'deals'} (${esc(money(activeValue, currency, true))})</div>
      <div>${mine[0] ? esc(formatRelativeTime(mine[0].date, now)) : 'No contact yet'}</div>
      <div>Lifetime: ${esc(money(wonValue, currency, true))}</div>
      <div>${shown.map((tag) => `<span class="tag" data-tag>${esc(tag.name)}</span>`).join('')}${extra > 0 ? `<span>+${extra}</span>` : ''}</div>
    </article>
  `;
}

function renderContactPanel(ctx, contactId, currency) {
  const contact = contactById(ctx.contacts, contactId);
  if (!contact) return '';
  const deals = ctx.deals.filter((deal) => deal.contactId === contact.id);
  const activities = ctx.activities.filter((activity) => activity.contactId === contact.id).slice(0, 5);
  const strength = relationshipStrength(contact, { activities: ctx.activities, deals: ctx.deals, customers: ctx.customers, now: ctx.now });
  return `
    <aside class="drawer" data-panel="contact">
      <h2>${esc(contact.name)}</h2>
      <p>${esc(contact.email || '')}</p>
      <p>${esc(contact.phone || '')}</p>
      <p>Relationship Strength ${strength.score}</p>
      ${deals.map((deal) => `<p>${esc(deal.title)} ${esc(money(deal.value, currency, true))}</p>`).join('')}
      ${activities.map((activity) => `<p>${esc(activity.title)}</p>`).join('')}
      <button type="button" data-action="log" data-log-type="call">Log Call</button>
      <button type="button" data-action="log" data-log-type="email">Log Email</button>
      <button type="button" data-action="log" data-log-type="meeting">Schedule Meeting</button>
      <button type="button" data-action="log" data-log-type="note">Add Note</button>
      <button type="button" data-action="edit-contact" data-id="${esc(contact.id)}">Edit</button>
      <button type="button" data-action="delete" data-kind="contact" data-id="${esc(contact.id)}">Delete</button>
    </aside>
  `;
}

function renderChronicle(ctx) {
  const { contacts, deals, activities, now, ui, route } = ctx;
  const filtered = filterActivities(activities, {
    type: ui.chronicleType,
    contactId: route.params.contact || '',
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  const page = filtered.slice(0, ui.chronicleLimit);
  const today = calendarKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = calendarKey(yesterdayDate);
  let lastDay = '';
  const rows = page.map((activity, index) => {
    const key = calendarKey(activity.date);
    let separator = '';
    if (key !== lastDay) {
      lastDay = key;
      const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : formatMediumDate(key);
      separator = `<div class="day-separator">${label}</div>`;
    }
    const contact = contactById(contacts, activity.contactId);
    const deal = deals.find((item) => item.id === activity.dealId);
    return `
      ${separator}
      <article class="entry" data-activity-id="${esc(activity.id)}" data-side="${index % 2 === 0 ? 'left' : 'right'}" data-type="${esc(activity.type)}">
        <strong>${esc(activity.title)}</strong>
        <div>${esc(activity.description || '')}</div>
        <button type="button" data-link="contact" data-id="${esc(activity.contactId)}">${esc(contact?.name || 'Contact')}</button>
        ${deal ? `<button type="button" data-link="deal" data-id="${esc(deal.id)}">${esc(deal.title)}</button>` : ''}
        <div>${esc(formatRelativeTime(activity.date, now))}</div>
        <button type="button" aria-label="Edit activity" data-action="edit-activity" data-id="${esc(activity.id)}">Edit</button>
        <button type="button" aria-label="Delete activity" data-action="delete" data-kind="activity" data-id="${esc(activity.id)}">Delete</button>
      </article>
    `;
  }).join('');
  return `
    <section data-view="chronicle">
      <header class="view-header"><h1>The Chronicle</h1></header>
      <div class="log-bar">
        <button type="button" data-log="call" data-action="quick-log">Log Call</button>
        <button type="button" data-log="email" data-action="quick-log">Log Email</button>
        <button type="button" data-log="meeting" data-action="quick-log">Log Meeting</button>
        <button type="button" data-log="note" data-action="quick-log">Add Note</button>
      </div>
      <div class="filters">
        ${['all', 'call', 'email', 'meeting', 'note'].map((type) => `<button type="button" data-filter-type="${type}">${type === 'all' ? 'All' : `${type[0].toUpperCase()}${type.slice(1)}s`}</button>`).join('')}
      </div>
      <div class="timeline" data-timeline>${rows}<div data-timeline-sentinel></div></div>
    </section>
  `;
}

function renderRadar(ctx, currency) {
  const { deals, now, ui } = ctx;
  const range = presetRange(ui.radarRange, now);
  const summary = winLossModel(deals, range);
  const dealWord = (count) => `${count} ${count === 1 ? 'deal' : 'deals'}`;
  const presets = [
    ['this-month', 'This Month'],
    ['last-3-months', 'Last 3 Months'],
    ['last-6-months', 'Last 6 Months'],
    ['this-year', 'This Year'],
    ['all-time', 'All Time'],
  ];
  return `
    <section data-view="radar">
      <header class="view-header">
        <h1>The Radar</h1>
        <div class="filters">
          ${presets.map(([id, label]) => `<button type="button" data-range="${id}" aria-pressed="${ui.radarRange === id ? 'true' : 'false'}">${label}</button>`).join('')}
        </div>
      </header>
      <div class="chart-grid">
        <article class="chart-card glass"><h2>Conversion Funnel</h2><canvas data-chart="funnel" width="480" height="240"></canvas></article>
        <article class="chart-card glass"><h2>Revenue Heatmap</h2><canvas data-chart="heatmap" width="480" height="240"></canvas></article>
        <article class="chart-card glass"><h2>Pipeline Velocity</h2><canvas data-chart="velocity" width="480" height="240"></canvas></article>
        <article class="chart-card glass">
          <h2>Win/Loss</h2>
          <canvas data-chart="winloss" width="480" height="240"></canvas>
          <p>${summary.winRate}%</p>
          <p>Won: ${dealWord(summary.wonCount)} (${esc(money(summary.wonValue, currency))})</p>
          <p>Lost: ${dealWord(summary.lostCount)} (${esc(money(summary.lostValue, currency))})</p>
        </article>
      </div>
      <div data-chart-tooltip></div>
    </section>
  `;
}

function renderCustomers(ctx, currency) {
  const { contacts, customers, orders, deals, activities, ui, now } = ctx;
  const visible = filterCustomers(customers, contacts, ui.customerQuery);
  const selectedId = ui.selectedCustomerId;
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;
  return `
    <section data-view="customers">
      <header class="view-header"><h1>Customer HQ</h1></header>
      <div class="split">
        <div class="panel glass">
          <input data-search placeholder="Search" value="${esc(ui.customerQuery)}">
          ${visible.map((customer) => {
            const contact = contactById(contacts, customer.contactId);
            const stats = customerStats(orders.filter((order) => order.customerId === customer.id));
            return `
              <button type="button" class="customer-item" data-customer-id="${esc(customer.id)}" ${customer.id === selectedId ? 'data-selected="true"' : ''}>
                <span class="avatar" style="background:${avatarGradient(contact?.name || '')}">${esc(initials(contact?.name || '?'))}</span>
                <span><strong>${esc(contact?.name || '')}</strong><br><span class="secondary">${esc(contact?.company || '')}</span></span>
                <span>${esc(money(stats.revenue, currency))}</span>
                <canvas data-sparkline width="60" height="20"></canvas>
              </button>
            `;
          }).join('')}
        </div>
        <div>${selected ? renderCustomerDetail(selected, ctx, currency) : '<p>No customers yet.</p>'}</div>
      </div>
    </section>
  `;
}

function renderCustomerDetail(customer, ctx, currency) {
  const contact = contactById(ctx.contacts, customer.contactId);
  const orders = ctx.orders.filter((order) => order.customerId === customer.id);
  const stats = customerStats(orders);
  const tab = ctx.ui.customerTab;
  const rating = Number(customer.satisfactionRating || 0);
  return `
    <article class="panel glass">
      <header class="view-header">
        <div>
          <div class="avatar xl" style="background:${avatarGradient(contact?.name || '')}">${esc(initials(contact?.name || '?'))}</div>
          <h2>${esc(contact?.name || '')}</h2>
          <p>${esc(contact?.company || '')}</p>
          <p>Customer since ${esc(formatMediumDate(customer.convertedAt))}</p>
        </div>
        <div>
          ${[1, 2, 3, 4, 5].map((star) => `<button type="button" data-rating="${star}" aria-pressed="${rating === star ? 'true' : 'false'}">★</button>`).join('')}
        </div>
      </header>
      <div class="stats">
        <article class="stat" data-stat="revenue"><span>Total Revenue</span><strong>${esc(money(stats.revenue, currency))}</strong></article>
        <article class="stat" data-stat="orders"><span>Total Orders</span><strong>${stats.orderCount}</strong></article>
        <article class="stat" data-stat="average"><span>Average Order Value</span><strong>${esc(money(stats.average, currency))}</strong></article>
        <article class="stat" data-stat="last-order"><span>Last Order Date</span><strong>${esc(stats.lastOrderDate ? formatMediumDate(stats.lastOrderDate) : '—')}</strong></article>
      </div>
      <div class="tabs">
        ${['orders', 'pipeline', 'notes', 'activity'].map((name) => `<button type="button" data-tab="${name}">${name[0].toUpperCase()}${name.slice(1)}</button>`).join('')}
        <button type="button" class="primary" data-action="new-order">New Order</button>
      </div>
      ${tab === 'orders' ? `
        <div data-tab-panel="orders">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${orders.map((order) => `<tr><td>${esc(formatMediumDate(order.date))}</td><td>${esc(order.description)}</td><td>${esc(money(order.amount, currency))}</td><td data-status="${esc(order.status)}">${esc(order.status)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      ${tab === 'pipeline' ? `
        <div data-tab-panel="pipeline">
          ${openDealsForContact(ctx.deals, customer.contactId).map((deal) => `<article class="deal-card"><strong>${esc(deal.title)}</strong><span>${esc(money(deal.value, currency, true))}</span><span>${esc(deal.stage)}</span></article>`).join('') || '<p>No open deals.</p>'}
          <button type="button" data-action="new-deal" data-contact-id="${esc(customer.contactId)}">New Deal</button>
        </div>
      ` : ''}
      ${tab === 'notes' ? `
        <div data-tab-panel="notes">
          <textarea data-notes data-customer-id="${esc(customer.id)}">${esc(customer.notes || '')}</textarea>
          <div class="notes-preview">${renderNotes(customer.notes || '')}</div>
        </div>
      ` : ''}
      ${tab === 'activity' ? `
        <div data-tab-panel="activity">
          ${ctx.activities.filter((activity) => activity.contactId === customer.contactId).map((activity) => `<p>${esc(activity.title)}</p>`).join('') || '<p>No activity yet.</p>'}
        </div>
      ` : ''}
    </article>
  `;
}

function renderSettings(ctx) {
  const { settings, tags, ui } = ctx;
  return `
    <section data-view="settings">
      <header class="view-header"><h1>Settings</h1></header>
      <section class="panel glass">
        <h2>Profile</h2>
        <label>Name <input data-field="userName" value="${esc(settings.userName || '')}"></label>
        <label>Currency <input data-field="currency" value="${esc(settings.currency || '₹')}"></label>
      </section>
      <section class="panel glass">
        <h2>Pipeline Stages</h2>
        ${(settings.stages || []).map((stage) => `<label>${esc(stage.id)} <input data-stage-id="${esc(stage.id)}" value="${esc(stage.name)}"></label>`).join('')}
      </section>
      <section class="panel glass">
        <h2>Tags</h2>
        <label>Tag <input data-field="tagName" value=""></label>
        <label>Color <input data-field="tagColor" value="#6366f1"></label>
        ${ui.tagError ? `<p class="field-error" data-error-for="tagName">${esc(ui.tagError)}</p>` : ''}
        <button type="button" data-action="add-tag">Add tag</button>
        <ul>${tags.map((tag) => `<li>${esc(tag.name)}</li>`).join('')}</ul>
      </section>
      <section class="panel glass">
        <h2>Data</h2>
        <button type="button" data-action="export">Export All Data</button>
        <label>Import <input type="file" data-field="import" accept="application/json,.json"></label>
        <button type="button" data-action="reset-demo">Reset Demo Data</button>
        <button type="button" data-action="clear-all">Clear All Data</button>
      </section>
    </section>
  `;
}

function renderOverlay(ctx) {
  if (ctx.ui.confirm) {
    return `
      <div data-overlay>
        <div role="alertdialog">
          <p>${esc(ctx.ui.confirm.message)}</p>
          <button type="button" data-action="confirm-no">Cancel</button>
          <button type="button" data-action="confirm-yes">${esc(ctx.ui.confirm.yes)}</button>
        </div>
      </div>
    `;
  }
  if (ctx.ui.help) {
    return `
      <div data-overlay>
        <div role="dialog">
          <h2>Keyboard shortcuts</h2>
          <ul>
            <li>1 Briefing</li><li>2 Pipeline</li><li>3 Roster</li><li>4 Chronicle</li><li>5 Radar</li><li>6 Customers</li>
            <li>N New</li><li>Escape Close</li><li>/ Search</li><li>? Keyboard shortcuts</li>
          </ul>
          <button type="button" data-action="cancel-modal">Close</button>
        </div>
      </div>
    `;
  }
  if (!ctx.ui.modal) return ctx.ui.celebrate ? '<div data-celebration></div>' : '';
  return `${ctx.ui.celebrate ? '<div data-celebration></div>' : ''}${renderModal(ctx)}`;
}

function renderModal(ctx) {
  const { ui, contacts, deals } = ctx;
  const errors = ui.modalError || {};
  const modal = ui.modal;
  let title = 'Edit';
  let body = '';
  if (modal.type === 'contact') {
    title = 'Add Contact';
    body = `
      <label>Name <input data-field="name" value=""></label>${fieldError(errors, 'name')}
      <label>Email <input data-field="email" value=""></label>${fieldError(errors, 'email')}
      <label>Phone <input data-field="phone" value=""></label>
      <label>Company <input data-field="company" value=""></label>
      <label>Title <input data-field="title" value=""></label>
      <label>Tags <select data-field="tags"></select></label>
      <label>Source <input data-field="source" value=""></label>
      <label>Notes <textarea data-field="notes"></textarea></label>
    `;
  } else if (modal.type === 'deal') {
    title = 'New Deal';
    body = `
      <label>Title <input data-field="title" value="${esc(modal.draft?.title || '')}"></label>${fieldError(errors, 'title')}
      <label>Contact <select data-field="contact"><option value=""></option>${contacts.map((contact) => `<option value="${esc(contact.id)}" ${modal.preset?.contactId === contact.id ? 'selected' : ''}>${esc(contact.name)}</option>`).join('')}</select></label>${fieldError(errors, 'contact')}
      <label>Value <input data-field="value" type="number" value="${esc(modal.draft?.value || '')}"></label>${fieldError(errors, 'value')}
      <label>Stage <select data-field="stage">${STAGES.map((stage) => `<option value="${stage}">${esc(stageLabel(ctx.settings, stage))}</option>`).join('')}</select></label>
      <label>Expected Close Date <input data-field="expectedCloseDate" type="date"></label>
      <label>Priority <select data-field="priority"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>Notes <textarea data-field="notes"></textarea></label>
    `;
  } else if (modal.type === 'activity') {
    title = modal.activityType === 'email' ? 'Log Email' : modal.activityType === 'meeting' ? 'Log Meeting' : modal.activityType === 'note' ? 'Add Note' : 'Log Call';
    const showDuration = modal.activityType === 'call' || modal.activityType === 'meeting';
    body = `
      <label>Contact <select data-field="contact"><option value=""></option>${contacts.map((contact) => `<option value="${esc(contact.id)}" ${modal.preset?.contactId === contact.id ? 'selected' : ''}>${esc(contact.name)}</option>`).join('')}</select></label>${fieldError(errors, 'contact')}
      <label>Deal <select data-field="deal"><option value=""></option>${deals.map((deal) => `<option value="${esc(deal.id)}" ${modal.preset?.dealId === deal.id ? 'selected' : ''}>${esc(deal.title)}</option>`).join('')}</select></label>
      <label>Title <input data-field="title" value=""></label>${fieldError(errors, 'title')}
      <label>Description <textarea data-field="description"></textarea></label>
      <label>Date <input data-field="date" value="${esc(ctx.now.toISOString())}"></label>
      ${showDuration ? `<label>Duration <input data-field="duration" type="number" value=""></label>` : ''}
      <label>Outcome <input data-field="outcome" value=""></label>
    `;
  } else if (modal.type === 'order') {
    title = 'New Order';
    body = `
      <label>Description <input data-field="description" value=""></label>${fieldError(errors, 'description')}
      <label>Amount <input data-field="amount" type="number" value=""></label>${fieldError(errors, 'amount')}
      <label>Date <input data-field="date" type="date" value="${esc(calendarKey(ctx.now))}"></label>
      <label>Status <select data-field="status"><option>pending</option><option>completed</option><option>cancelled</option></select></label>
      <label>Notes <textarea data-field="notes"></textarea></label>
    `;
  } else if (modal.type === 'lost') {
    title = 'Why was this deal lost?';
    body = `
      <p>Why was this deal lost?</p>
      <ul>${LOST_REASONS.map((reason) => `<li>${reason}</li>`).join('')}</ul>
      <label>Lost reason <input data-field="lostReason" value=""></label>${fieldError(errors, 'lostReason')}
    `;
  } else if (modal.type === 'convert') {
    title = 'Convert';
    body = `<p>${esc(conversionMessage(modal.name))}</p><button type="button" data-action="convert-yes">Yes</button><button type="button" data-action="convert-no">No</button>`;
  } else if (modal.type === 'import') {
    title = 'Import';
    body = `<p>${esc(modal.preview)}</p><p>${esc(IMPORT_WARNING)}</p><button type="button" data-action="replace-import">Replace all data</button>`;
  }
  const showSave = !['convert', 'import'].includes(modal.type);
  return `
    <div data-overlay>
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        ${body}
        ${showSave ? '<button type="button" data-action="save-modal">Save</button>' : ''}
        <button type="button" data-action="cancel-modal">Cancel</button>
      </div>
    </div>
  `;
}
