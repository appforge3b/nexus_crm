import { ACTIVE_STAGES, STAGES, LOST_REASONS, STAGE_PROBABILITY } from './stages.js';
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
import { buildKpis, closingSummary, presetRange, inRange } from './metrics.js';
import { filterActivities, filterContacts, filterCustomers, filterDeals } from './filters.js';
import { contactLifetime, customerStats, openDealsForContact } from './customers.js';
import {
  forecastModel, funnelModel, heatmapModel, lostReasons, sparklineValues, velocityModel, winLossModel,
} from './charts.js';
import { IMPORT_WARNING, conversionMessage } from './copy.js';
import { NAV, esc, icon } from './markup.js';
import { renderNotes } from './markdown.js';

export const STAGE_COLOR = {
  prospect: '#38bdf8',
  qualified: '#3b82f6',
  proposal: '#8b5cf6',
  negotiation: '#d946ef',
  closing: '#f59e0b',
  won: '#10b981',
  lost: '#ef4444',
};

export const ACTIVITY_COLOR = { call: '#3b82f6', email: '#10b981', meeting: '#8b5cf6', note: '#64748b' };
const ACTIVITY_LABEL = { call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note' };
const LOG_LABEL = { call: 'Log Call', email: 'Log Email', meeting: 'Log Meeting', note: 'Add Note' };
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const PRIORITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function money(amount, currency, compact = false) {
  return compact ? formatMoneyCompact(amount, currency) : formatMoney(amount, currency);
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function timeOfDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function contactById(contacts, id) {
  return contacts.find((contact) => contact.id === id) ?? null;
}

function avatar(name, size = '') {
  return `<span class="avatar ${size}" style="background:${avatarGradient(name || '?')}">${esc(initials(name || '?'))}</span>`;
}

function counter(key, value, format, display) {
  return `<strong class="num" data-count="${Number(value) || 0}" data-count-key="${esc(key)}" data-count-format="${format}">${esc(display)}</strong>`;
}

function chart(kind, key, model, label) {
  return `<canvas data-chart="${kind}" data-chart-key="${esc(key)}" data-model="${esc(JSON.stringify(model))}" role="img" aria-label="${esc(label)}"></canvas>`;
}

function trend(item) {
  if (!item) return '';
  const arrow = item.direction === 'up' ? '▲' : item.direction === 'down' ? '▼' : '';
  return `<span class="trend trend-${item.direction}">${arrow} ${esc(item.label)}</span>`;
}

function stageBadge(settings, stage) {
  return `<span class="badge stage-badge" style="--tone:${STAGE_COLOR[stage] || '#64748b'}">${esc(stageLabel(settings, stage))}</span>`;
}

function priorityBadge(priority) {
  return `<span class="badge priority-badge" data-priority="${esc(priority)}">${esc(PRIORITY_LABEL[priority] || priority)}</span>`;
}

function lastActivityFor(activities, predicate) {
  return activities.filter(predicate).sort((a, b) => new Date(b.date) - new Date(a.date))[0] ?? null;
}

function emptyState(iconName, title, body, action = '') {
  return `<div class="empty-state">${icon(iconName, 22)}<strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</div>`;
}

function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <defs><linearGradient id="nx-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
    <path d="M6 26V6l20 20V6" fill="none" stroke="url(#nx-grad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ───────────────────────────── Shell ───────────────────────────── */

export function renderShell() {
  const links = NAV.map(([id, label, href], index) => `
    <a href="${href}" class="nav-link" title="${label}">
      <span class="nav-icon">${icon(id)}</span><span class="nav-label">${label}</span><kbd class="nav-kbd">${index + 1}</kbd>
    </a>`).join('');
  return `
    <canvas data-particle-field aria-hidden="true"></canvas>
    <div class="ambient" aria-hidden="true"></div>
    <div class="shell">
      <nav data-sidebar class="sidebar" aria-label="Primary" data-collapsed="false" data-open="false">
        <div class="brand">${brandMark()}<span class="wordmark">NEXUS</span></div>
        <div class="nav-group">${links}</div>
        <div class="sidebar-actions">
          <a href="#/settings" class="nav-link" title="Settings"><span class="nav-icon">${icon('settings')}</span><span class="nav-label">Settings</span></a>
          <button type="button" class="nav-link" data-action="show-help" title="Keyboard shortcuts"><span class="nav-icon">${icon('keyboard')}</span><span class="nav-label">Shortcuts</span><kbd class="nav-kbd">?</kbd></button>
          <button type="button" class="nav-link collapse-btn" aria-label="Collapse sidebar" title="Collapse sidebar"><span class="nav-icon">${icon('collapse')}</span><span class="nav-label">Collapse</span></button>
        </div>
      </nav>
      <header class="topbar">
        <button type="button" class="icon-btn" aria-label="Open menu">${icon('menu')}</button>
        <div class="brand">${brandMark()}<span class="wordmark">NEXUS</span></div>
        <button type="button" class="icon-btn accent" data-action="new-context" aria-label="Create new">${icon('plus')}</button>
      </header>
      <main class="workspace" id="main"></main>
      <nav data-bottom-nav class="bottom-nav" aria-label="Primary">
        ${NAV.map(([id, label, href]) => `<a href="${href}">${icon(id, 20)}<span>${label}</span></a>`).join('')}
      </nav>
    </div>
    <div class="scrim" data-action="close-menu"></div>
    <div class="overlay-host"></div>
    <div class="toasts" aria-live="polite"></div>
    <div class="fx-layer" aria-hidden="true"></div>
  `;
}

export function renderView(ctx) {
  const currency = ctx.settings.currency || '₹';
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

/* ─────────────────────────── Briefing ─────────────────────────── */

function renderBriefing(ctx, currency) {
  const { contacts, deals, activities, settings, now } = ctx;
  const kpis = buildKpis(deals, now, currency);
  const priorities = listPriorities({ deals, activities, contacts, now });
  const feed = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const insights = priorities.slice(0, 3).filter((item) => item.urgency === 'critical' || item.urgency === 'high');
  const flow = ACTIVE_STAGES.map((stage) => {
    const rows = deals.filter((deal) => deal.stage === stage);
    return { stage, count: rows.length, value: rows.reduce((sum, deal) => sum + Number(deal.value || 0), 0) };
  });
  const flowMax = Math.max(1, ...flow.map((row) => row.value));
  const conversion = kpis.conversion.rate;

  return `
    <section data-view="briefing" class="view">
      <header class="view-header briefing-header stagger">
        <div>
          <p class="eyebrow">The Briefing</p>
          <h1>${esc(greetingForHour(now.getHours()))}, ${esc(settings.userName || 'there')}</h1>
          <p class="date-line">${esc(formatLongDate(now))}</p>
          <p class="summary-line">${icon('flame', 16)}<span>${esc(closingSummary(deals, now, currency))}</span></p>
          ${insights.length ? `<div class="insights">${insights.map((item) => `
            <button type="button" class="insight" data-insight-id="${esc(item.deal.id)}">
              <span class="urgency ${item.urgency === 'critical' ? 'pulse-critical' : ''}" data-urgency="${item.urgency}"></span>${esc(item.contact?.name?.split(' ')[0] || 'Deal')}: ${esc(item.primaryReason)}
            </button>`).join('')}</div>` : ''}
        </div>
        <div class="header-actions">
          <button type="button" class="icon-btn" data-action="show-help" aria-label="Keyboard shortcuts">${icon('keyboard')}</button>
          <a href="#/settings" class="icon-btn" aria-label="Settings">${icon('settings')}</a>
        </div>
      </header>

      <div class="kpi-row stagger" data-region="kpis">
        <article class="kpi glass" data-kpi="pipeline">
          <span class="kpi-label">${icon('pipeline', 15)} Pipeline Value</span>
          ${counter('kpi-pipeline', kpis.pipeline.value, 'compact', kpis.pipeline.formattedValue)}
          <div class="kpi-foot"><span>${plural(kpis.pipeline.count, 'deal')}</span>${trend(kpis.pipeline.trend)}</div>
        </article>
        <article class="kpi glass" data-kpi="won">
          <span class="kpi-label">${icon('customers', 15)} Won This Month</span>
          ${counter('kpi-won', kpis.won.value, 'compact', kpis.won.formattedValue)}
          <div class="kpi-foot"><span>${plural(kpis.won.count, 'deal')}</span>${trend(kpis.won.trend)}</div>
        </article>
        <article class="kpi glass" data-kpi="conversion">
          <span class="kpi-label">${icon('radar', 15)} Conversion Rate</span>
          ${conversion == null ? `<strong class="num">${esc(kpis.conversion.formattedRate)}</strong>` : counter('kpi-conversion', Math.round(conversion), 'percent', kpis.conversion.formattedRate)}
          <div class="kpi-foot"><span>this month</span>${trend(kpis.conversion.trend)}</div>
        </article>
      </div>

      <div class="briefing-grid">
        <section class="panel glass stagger" data-region="priorities">
          <header class="panel-head"><h2>Today's Priorities</h2>${priorities.length ? `<span class="count-pill">${priorities.length}</span>` : ''}</header>
          ${priorities.length ? `<div class="priority-list">${priorities.map((item) => `
            <button type="button" class="priority" data-priority-id="${esc(item.deal.id)}" data-level="${item.urgency}" title="${esc(item.reasons.join(' · '))}">
              <span class="urgency ${item.urgency === 'critical' ? 'pulse-critical' : ''}" data-urgency="${item.urgency}"></span>
              <span class="priority-main">
                <span class="priority-name">${esc(item.contact?.name || 'Unknown')} <span class="priority-value">${esc(money(item.deal.value, currency, true))}</span></span>
                <span class="priority-deal">${esc(item.deal.title)}</span>
              </span>
              <span class="priority-reason">${esc(item.primaryReason)}</span>
              <span class="chevron">${icon('chevron', 16)}</span>
            </button>`).join('')}</div>` : emptyState('bolt', 'Nothing urgent right now.', 'Deals that need attention will surface here.')}
        </section>

        <section class="panel glass stagger forecast-panel" data-region="forecast">
          <header class="panel-head">
            <h2>Revenue Forecast</h2>
            <div class="legend"><span class="legend-item"><i class="swatch solid"></i>Won</span><span class="legend-item"><i class="swatch dashed"></i>Forecast</span><span class="legend-item"><i class="swatch band"></i>Confidence</span></div>
          </header>
          <div class="chart-box tall">${chart('forecast', 'forecast', { points: forecastModel(deals, now) }, 'Revenue by month with a three month forecast')}</div>
        </section>

        <section class="panel glass stagger" data-region="activity-feed">
          <header class="panel-head"><h2>Activity Feed</h2><a href="#/chronicle" class="text-link">View all ${icon('chevron', 14)}</a></header>
          ${feed.length ? `<div class="feed">${feed.map((activity) => {
            const contact = contactById(contacts, activity.contactId);
            return `<button type="button" class="feed-item" data-activity-id="${esc(activity.id)}" data-contact-id="${esc(activity.contactId)}" style="--tone:${ACTIVITY_COLOR[activity.type]}">
              <span class="feed-icon">${icon(activity.type, 14)}</span>
              <span class="feed-body"><span class="feed-title">${esc(activity.title)}</span><span class="feed-meta"><span class="feed-contact">${esc(contact?.name || '')}</span> · ${esc(formatRelativeTime(activity.date, now))}</span></span>
            </button>`;
          }).join('')}</div>` : emptyState('chronicle', 'No activity yet.', 'Log a call, email, or meeting to start your timeline.')}
        </section>

        <section class="panel glass stagger" data-region="flow">
          <header class="panel-head"><h2>Pipeline Flow</h2><a href="#/pipeline" class="text-link">Open pipeline ${icon('chevron', 14)}</a></header>
          <div class="flow">${flow.map((row) => `
            <a href="#/pipeline" class="flow-row" style="--tone:${STAGE_COLOR[row.stage]};--fill:${Math.max(row.value ? 6 : 0, (row.value / flowMax) * 100)}%">
              <span class="flow-label">${esc(stageLabel(settings, row.stage))}</span>
              <span class="flow-track"><span class="flow-fill"></span></span>
              <span class="flow-value">${esc(money(row.value, currency, true))}<small>${plural(row.count, 'deal')}</small></span>
            </a>`).join('')}
          </div>
        </section>
      </div>
      <div class="chart-tooltip" data-chart-tooltip data-visible="false"></div>
    </section>
  `;
}

/* ─────────────────────────── Pipeline ─────────────────────────── */

function renderPipeline(ctx, currency) {
  const { contacts, deals, settings, ui, route } = ctx;
  const { filters } = ui;
  const filtered = filterDeals(deals, contacts, filters);
  const stages = STAGES.filter((stage) => stage !== 'lost' || ui.showLost);
  const open = deals.filter((deal) => ACTIVE_STAGES.includes(deal.stage));
  const openValue = open.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const weighted = open.reduce((sum, deal) => sum + (Number(deal.value || 0) * Number(deal.probability || 0)) / 100, 0);
  const lostCount = deals.filter((deal) => deal.stage === 'lost').length;
  const mobileStage = ui.mobileStage || 'prospect';

  const chips = [];
  if (filters.search) chips.push(['search', `“${filters.search}”`]);
  if (filters.minValue !== '') chips.push(['minValue', `Min ${money(Number(filters.minValue), currency, true)}`]);
  if (filters.maxValue !== '') chips.push(['maxValue', `Max ${money(Number(filters.maxValue), currency, true)}`]);
  for (const priority of filters.priorities) chips.push([`priority:${priority}`, PRIORITY_LABEL[priority]]);
  if (filters.createdFrom || filters.createdTo) {
    chips.push(['created', `Created ${filters.createdFrom ? formatMediumDate(filters.createdFrom) : '…'} – ${filters.createdTo ? formatMediumDate(filters.createdTo) : '…'}`]);
  }

  return `
    <section data-view="pipeline" class="view">
      <header class="view-header stagger">
        <div>
          <p class="eyebrow">Deal Flow</p>
          <h1>The Pipeline</h1>
          <p class="subtitle">${plural(open.length, 'open deal')} · ${esc(money(openValue, currency, true))} in play · ${esc(money(weighted, currency, true))} weighted</p>
        </div>
        <button type="button" class="btn primary" data-action="new-deal">${icon('plus', 16)}New Deal</button>
      </header>

      <div class="filter-bar glass stagger">
        <label class="search-box">${icon('search', 16)}<input data-search type="search" placeholder="Search deals, companies, contacts" value="${esc(filters.search)}" aria-label="Search deals"></label>
        <div class="filter-group" role="group" aria-label="Value range">
          <span class="filter-label">Value</span>
          <input class="mini-input" data-field="minValue" type="number" min="0" placeholder="Min" value="${esc(filters.minValue)}" aria-label="Minimum value">
          <span class="dash">–</span>
          <input class="mini-input" data-field="maxValue" type="number" min="0" placeholder="Max" value="${esc(filters.maxValue)}" aria-label="Maximum value">
        </div>
        <div class="filter-group" role="group" aria-label="Priority">
          ${PRIORITIES.map((priority) => `
            <label class="toggle-pill" data-priority="${priority}">
              <input type="checkbox" name="priority" value="${priority}" ${filters.priorities.includes(priority) ? 'checked' : ''}>
              <span class="urgency" data-urgency="${priority}"></span>${PRIORITY_LABEL[priority]}
            </label>`).join('')}
        </div>
        <div class="filter-group" role="group" aria-label="Created between">
          <span class="filter-label">${icon('calendar', 14)}</span>
          <input class="mini-input date" data-field="createdFrom" type="date" value="${esc(filters.createdFrom)}" aria-label="Created from">
          <span class="dash">–</span>
          <input class="mini-input date" data-field="createdTo" type="date" value="${esc(filters.createdTo)}" aria-label="Created to">
        </div>
        <button type="button" class="btn ghost small ${ui.showLost ? 'is-on' : ''}" data-action="toggle-lost" aria-pressed="${ui.showLost ? 'true' : 'false'}">${ui.showLost ? 'Hide lost' : 'Show lost'} <span class="count-pill">${lostCount}</span></button>
      </div>

      ${chips.length ? `<div class="chips">
        ${chips.map(([key, label]) => `<span class="chip" data-filter-chip>${esc(label)}<button type="button" data-action="clear-filter" data-filter="${esc(key)}" aria-label="Remove filter">${icon('close', 12)}</button></span>`).join('')}
        <button type="button" class="text-link" data-action="clear-filters">Clear all</button>
      </div>` : ''}

      <div class="stage-pager" data-stage-pager role="tablist" aria-label="Stages">
        ${STAGES.filter((stage) => stage !== 'lost').map((stage) => `<button type="button" role="tab" data-mobile-stage-tab="${stage}" aria-selected="${mobileStage === stage ? 'true' : 'false'}" style="--tone:${STAGE_COLOR[stage]}">${esc(stageLabel(settings, stage).toUpperCase())} <span>${filtered.filter((deal) => deal.stage === stage).length}</span></button>`).join('')}
      </div>

      <div class="board stagger" data-scroll-key="board" data-mobile-stage="${esc(mobileStage)}">
        ${stages.map((stage) => {
          const columnDeals = filtered.filter((deal) => deal.stage === stage);
          const total = columnDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
          return `
            <section class="stage" data-stage="${stage}" ${stage === 'won' ? 'data-highlight="won"' : ''} style="--tone:${STAGE_COLOR[stage]}" aria-label="${esc(stageLabel(settings, stage))}">
              <header class="stage-header">
                <div class="stage-title"><strong>${esc(stageLabel(settings, stage).toUpperCase())}</strong><span>${plural(columnDeals.length, 'deal')}</span></div>
                <span class="stage-value">${esc(money(total, currency, true))}</span>
              </header>
              <div class="stage-body" data-scroll-key="stage-${stage}">
                ${columnDeals.map((deal, index) => renderDealCard(deal, ctx, currency, index)).join('') || `<div class="stage-empty">Drop deals here</div>`}
              </div>
            </section>`;
        }).join('')}
      </div>
      ${route.params.deal ? renderDealPanel(ctx, route.params.deal, currency) : ''}
    </section>
  `;
}

function renderDealCard(deal, ctx, currency, index) {
  const contact = contactById(ctx.contacts, deal.contactId);
  const latest = lastActivityFor(ctx.activities, (activity) => activity.dealId === deal.id || activity.contactId === deal.contactId);
  const age = stageAgeDays(deal.stageChangedAt, ctx.now);
  const tone = stageAgeTone(age);
  const isTerminal = deal.stage === 'won' || deal.stage === 'lost';
  return `
    <article class="deal-card card" draggable="true" data-deal-id="${esc(deal.id)}" data-swipe-actions tabindex="0" style="--i:${Math.min(index, 10)}" aria-label="${esc(deal.title)}">
      <div class="deal-top">
        ${avatar(contact?.name || deal.title)}
        <div class="deal-id">
          <strong class="deal-title" title="${esc(deal.title)}">${esc(truncate(deal.title, 30))}</strong>
          <span class="deal-company">${esc(contact?.company || contact?.name || '')}</span>
        </div>
        <span class="urgency ${deal.priority === 'critical' ? 'pulse-critical' : `beat-${esc(deal.priority)}`}" data-urgency="${esc(deal.priority)}" title="${esc(PRIORITY_LABEL[deal.priority] || '')} priority"></span>
      </div>
      <div class="deal-value">${esc(money(deal.value, currency))}</div>
      <div class="age" data-age-tone="${tone}" style="--age:${isTerminal ? 100 : Math.min(100, Math.max(6, (age / 30) * 100))}%" title="${Math.floor(age)} days in stage"></div>
      <div class="deal-foot">
        <span>${icon('clock', 12)}${latest ? esc(formatRelativeTime(latest.date, ctx.now)) : 'No activity'}</span>
        <span class="age-label">${Math.floor(age)}d in stage</span>
      </div>
      <div class="quick-actions" aria-label="Quick actions">
        <button type="button" class="icon-btn tiny" data-action="log" data-log-type="call" data-contact-ref="${esc(deal.contactId)}" data-deal-ref="${esc(deal.id)}" aria-label="Log call" title="Log call">${icon('call', 14)}</button>
        <button type="button" class="icon-btn tiny" data-action="log" data-log-type="email" data-contact-ref="${esc(deal.contactId)}" data-deal-ref="${esc(deal.id)}" aria-label="Log email" title="Log email">${icon('email', 14)}</button>
        <button type="button" class="icon-btn tiny" data-action="log" data-log-type="meeting" data-contact-ref="${esc(deal.contactId)}" data-deal-ref="${esc(deal.id)}" aria-label="Schedule meeting" title="Schedule meeting">${icon('calendar', 14)}</button>
      </div>
    </article>
  `;
}

function detailRow(label, value) {
  return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
}

function miniTimeline(activities, ctx, emptyText) {
  if (!activities.length) return `<p class="muted small">${esc(emptyText)}</p>`;
  return `<ol class="mini-timeline">${activities.map((activity) => `
    <li style="--tone:${ACTIVITY_COLOR[activity.type]}">
      <span class="mini-dot">${icon(activity.type, 12)}</span>
      <div><strong>${esc(activity.title)}</strong><span class="muted small">${esc(ACTIVITY_LABEL[activity.type])} · ${esc(formatRelativeTime(activity.date, ctx.now))}${activity.duration ? ` · ${activity.duration} min` : ''}</span>
      ${activity.description ? `<p class="small clamp-2">${esc(activity.description)}</p>` : ''}</div>
    </li>`).join('')}</ol>`;
}

function quickLogButtons(contactId, dealId = '', meetingLabel = 'Log Meeting') {
  const ref = `data-contact-ref="${esc(contactId)}" ${dealId ? `data-deal-ref="${esc(dealId)}"` : ''}`;
  return `<div class="quick-log">
    <button type="button" class="log-chip" style="--tone:${ACTIVITY_COLOR.call}" data-action="log" data-log-type="call" ${ref}>${icon('call', 14)}Log Call</button>
    <button type="button" class="log-chip" style="--tone:${ACTIVITY_COLOR.email}" data-action="log" data-log-type="email" ${ref}>${icon('email', 14)}Log Email</button>
    <button type="button" class="log-chip" style="--tone:${ACTIVITY_COLOR.meeting}" data-action="log" data-log-type="meeting" ${ref}>${icon('meeting', 14)}${esc(meetingLabel)}</button>
    <button type="button" class="log-chip" style="--tone:${ACTIVITY_COLOR.note}" data-action="log" data-log-type="note" ${ref}>${icon('note', 14)}Add Note</button>
  </div>`;
}

function renderDealPanel(ctx, dealId, currency) {
  const deal = ctx.deals.find((item) => item.id === dealId);
  if (!deal) return '';
  const contact = contactById(ctx.contacts, deal.contactId);
  const timeline = ctx.activities
    .filter((activity) => activity.dealId === deal.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  const age = Math.floor(stageAgeDays(deal.stageChangedAt, ctx.now));
  return `
    <aside class="drawer" data-panel="deal" data-panel-key="deal:${esc(deal.id)}" aria-label="Deal details">
      <header class="drawer-head" style="--tone:${STAGE_COLOR[deal.stage]}">
        ${avatar(contact?.name || deal.title, 'lg')}
        <div class="drawer-title">
          <h2>${esc(deal.title)}</h2>
          <p class="muted">${esc(contact?.company || contact?.name || '')}</p>
        </div>
        <button type="button" class="icon-btn" data-action="close-panel" aria-label="Close panel">${icon('close')}</button>
      </header>
      <div class="drawer-body" data-scroll-key="drawer">
        <div class="drawer-hero">
          <span class="hero-value">${esc(money(deal.value, currency))}</span>
          <div class="badges">${stageBadge(ctx.settings, deal.stage)}${priorityBadge(deal.priority)}</div>
        </div>
        ${quickLogButtons(deal.contactId, deal.id)}
        <section class="drawer-section">
          <h3>Details</h3>
          <dl class="detail-grid">
            ${detailRow('Stage', `<select class="inline-select" data-move-stage="${esc(deal.id)}" aria-label="Move to stage">${STAGES.map((stage) => `<option value="${stage}" ${stage === deal.stage ? 'selected' : ''}>${esc(stageLabel(ctx.settings, stage))}</option>`).join('')}</select>`)}
            ${detailRow('Probability', `${Number(deal.probability ?? 0)}%`)}
            ${detailRow('Weighted value', esc(money((Number(deal.value || 0) * Number(deal.probability || 0)) / 100, currency, true)))}
            ${detailRow('Expected close', deal.expectedCloseDate ? esc(formatMediumDate(deal.expectedCloseDate)) : '<span class="muted">Not set</span>')}
            ${detailRow('Time in stage', `${plural(age, 'day')}`)}
            ${detailRow('Created', esc(formatMediumDate(calendarKey(deal.createdAt))))}
            ${deal.stage === 'lost' ? detailRow('Lost reason', esc(deal.lostReason || '—')) : ''}
          </dl>
          ${deal.notes ? `<div class="notes-block">${renderNotes(deal.notes)}</div>` : ''}
        </section>
        <section class="drawer-section">
          <h3>Contact</h3>
          ${contact ? `<div class="contact-mini">
            ${avatar(contact.name)}
            <div><button type="button" class="link-btn" data-link="contact" data-id="${esc(contact.id)}">${esc(contact.name)}</button>
            <span class="muted small">${esc([contact.title, contact.company].filter(Boolean).join(' at '))}</span></div>
          </div>
          <ul class="info-list">
            ${contact.email ? `<li>${icon('email', 14)}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>` : ''}
            ${contact.phone ? `<li>${icon('phone', 14)}<a href="tel:${esc(contact.phone.replace(/\s+/g, ''))}">${esc(contact.phone)}</a></li>` : ''}
            ${contact.company ? `<li>${icon('building', 14)}<span>${esc(contact.company)}</span></li>` : ''}
          </ul>` : '<p class="muted small">Contact not found.</p>'}
        </section>
        <section class="drawer-section">
          <h3>Activity</h3>
          ${miniTimeline(timeline, ctx, 'No activity logged against this deal yet.')}
        </section>
      </div>
      <footer class="drawer-foot">
        <button type="button" class="btn ghost" data-action="edit-deal" data-id="${esc(deal.id)}">${icon('edit', 15)}Edit</button>
        <button type="button" class="btn danger-ghost" data-action="delete" data-kind="deal" data-id="${esc(deal.id)}">${icon('trash', 15)}Delete</button>
      </footer>
    </aside>
  `;
}

/* ──────────────────────────── Roster ──────────────────────────── */

function renderRoster(ctx, currency) {
  const { contacts, ui, route } = ctx;
  const visible = filterContacts(contacts, { query: ui.rosterQuery, status: ui.rosterStatus })
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = {
    all: contacts.length,
    prospect: contacts.filter((contact) => contact.status === 'prospect').length,
    customer: contacts.filter((contact) => contact.status === 'customer').length,
    inactive: contacts.filter((contact) => contact.status === 'inactive').length,
  };
  const tabs = [['all', 'All'], ['prospect', 'Prospects'], ['customer', 'Customers'], ['inactive', 'Inactive']];
  return `
    <section data-view="roster" class="view">
      <header class="view-header roster-header stagger">
        <div><p class="eyebrow">The Roster</p><h1>Contacts</h1></div>
        <label class="search-box wide">${icon('search', 16)}<input data-search type="search" placeholder="Search contacts..." value="${esc(ui.rosterDraft)}" aria-label="Search contacts"></label>
        <div class="segmented" role="tablist" aria-label="Filter contacts">
          ${tabs.map(([id, label]) => `<button type="button" role="tab" data-status-tab="${id}" aria-selected="${ui.rosterStatus === id ? 'true' : 'false'}">${label} <span class="count">${counts[id]}</span></button>`).join('')}
        </div>
        <button type="button" class="btn primary" data-action="new-contact">${icon('plus', 16)}Add Contact</button>
      </header>
      ${visible.length ? `<div class="contact-grid stagger">${visible.map((contact, index) => renderContactCard(contact, ctx, currency, index)).join('')}</div>`
        : emptyState('roster', contacts.length ? 'No contacts match.' : 'No contacts yet.', contacts.length ? 'Try a different search or tab.' : 'Add your first contact to start building relationships.')}
      ${route.params.contact ? renderContactPanel(ctx, route.params.contact, currency) : ''}
    </section>
  `;
}

function tagPills(contact, tags, limit = 3) {
  const tagObjects = (contact.tags || []).map((id) => tags.find((tag) => tag.id === id)).filter(Boolean);
  const shown = tagObjects.slice(0, limit);
  const extra = tagObjects.length - shown.length;
  if (!tagObjects.length) return '';
  return `<div class="tags">${shown.map((tag) => `<span class="tag" data-tag style="--tag:${esc(tag.color || '#6366f1')}">${esc(tag.name)}</span>`).join('')}${extra > 0 ? `<span class="tag more">+${extra}</span>` : ''}</div>`;
}

function renderContactCard(contact, ctx, currency, index) {
  const { deals, activities, customers, orders, tags, now, route } = ctx;
  const strength = relationshipStrength(contact, { activities, deals, customers, now });
  const active = deals.filter((deal) => deal.contactId === contact.id && ACTIVE_STAGES.includes(deal.stage));
  const activeValue = active.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const lifetime = contactLifetime(contact, { deals, orders, customers });
  const latest = lastActivityFor(activities, (activity) => activity.contactId === contact.id);
  const role = [contact.title, contact.company].filter(Boolean).join(' at ');
  const selected = route.params.contact === contact.id;
  return `
    <article class="contact-card card ${selected ? 'is-selected' : ''}" data-contact-id="${esc(contact.id)}" tabindex="0" style="--i:${Math.min(index, 10)}" aria-label="${esc(contact.name)}">
      <div class="contact-head">
        ${avatar(contact.name, 'lg')}
        <div class="contact-id">
          <strong>${esc(contact.name)}</strong>
          <span class="secondary">${esc(role || 'No title yet')}</span>
        </div>
        <span class="status-dot" data-status="${esc(contact.status)}" title="${esc(contact.status)}"></span>
      </div>
      <div class="strength-head"><span>Relationship Strength</span><span class="strength-pct">${strength.score}%</span></div>
      <div class="strength" data-strength="${strength.score}"><span style="width:${strength.score}%;--s:${Math.max(1, strength.score)}"></span></div>
      <ul class="contact-meta">
        <li>${icon('flame', 14)}<span>${active.length} active ${active.length === 1 ? 'deal' : 'deals'} (${esc(money(activeValue, currency, true))})</span></li>
        <li>${icon('call', 14)}<span>Last contact: ${latest ? esc(formatRelativeTime(latest.date, now)) : 'never'}</span></li>
        <li>${icon('chart', 14)}<span>Lifetime: ${esc(money(lifetime, currency, true))}</span></li>
      </ul>
      ${tagPills(contact, tags)}
    </article>
  `;
}

function strengthBar(label, value, max) {
  return `<div class="breakdown-row"><span>${esc(label)}</span><span class="breakdown-track"><span style="width:${(value / max) * 100}%"></span></span><span class="breakdown-value">${value}/${max}</span></div>`;
}

function renderContactPanel(ctx, contactId, currency) {
  const contact = contactById(ctx.contacts, contactId);
  if (!contact) return '';
  const deals = ctx.deals.filter((deal) => deal.contactId === contact.id)
    .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
  const activities = ctx.activities
    .filter((activity) => activity.contactId === contact.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  const strength = relationshipStrength(contact, { activities: ctx.activities, deals: ctx.deals, customers: ctx.customers, now: ctx.now });
  const customer = ctx.customers.find((item) => item.contactId === contact.id);
  return `
    <aside class="drawer" data-panel="contact" data-panel-key="contact:${esc(contact.id)}" aria-label="Contact details">
      <header class="drawer-head">
        ${avatar(contact.name, 'lg')}
        <div class="drawer-title">
          <h2>${esc(contact.name)}</h2>
          <p class="muted">${esc([contact.title, contact.company].filter(Boolean).join(' at '))}</p>
        </div>
        <button type="button" class="icon-btn" data-action="close-panel" aria-label="Close panel">${icon('close')}</button>
      </header>
      <div class="drawer-body" data-scroll-key="drawer">
        <div class="badges"><span class="badge status-badge" data-status="${esc(contact.status)}">${esc(contact.status)}</span>${contact.source ? `<span class="badge">${esc(contact.source)}</span>` : ''}</div>
        ${tagPills(contact, ctx.tags, 10)}
        ${quickLogButtons(contact.id, '', 'Schedule Meeting')}
        ${customer ? `<button type="button" class="btn emerald block" data-action="open-customer" data-customer-ref="${esc(customer.id)}">${icon('customers', 15)}Open in Customer HQ</button>` : ''}
        <section class="drawer-section">
          <h3>Contact info</h3>
          <ul class="info-list">
            ${contact.email ? `<li>${icon('email', 14)}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>` : ''}
            ${contact.phone ? `<li>${icon('phone', 14)}<a href="tel:${esc(contact.phone.replace(/\s+/g, ''))}">${esc(contact.phone)}</a></li>` : ''}
            ${contact.company ? `<li>${icon('building', 14)}<span>${esc(contact.company)}</span></li>` : ''}
            <li>${icon('calendar', 14)}<span>Added ${esc(formatMediumDate(calendarKey(contact.createdAt)))}</span></li>
          </ul>
        </section>
        <section class="drawer-section">
          <h3>Relationship Strength <span class="strength-pct">${strength.score}%</span></h3>
          <div class="strength wide" data-strength="${strength.score}"><span style="width:${strength.score}%;--s:${Math.max(1, strength.score)}"></span></div>
          <div class="breakdown">
            ${strengthBar('Recency', strength.recency, 30)}
            ${strengthBar('Frequency', strength.frequency, 30)}
            ${strengthBar('Depth', strength.depth, 20)}
            ${strengthBar('Conversion', strength.conversion, 20)}
          </div>
        </section>
        <section class="drawer-section">
          <h3>Deals</h3>
          ${deals.length ? `<ul class="deal-list">${deals.map((deal) => `
            <li><button type="button" class="deal-row" data-link="deal" data-id="${esc(deal.id)}">
              <span class="deal-row-title">${esc(deal.title)}</span>${stageBadge(ctx.settings, deal.stage)}<span class="deal-row-value">${esc(money(deal.value, currency, true))}</span>
            </button></li>`).join('')}</ul>` : '<p class="muted small">No deals yet.</p>'}
          <button type="button" class="text-link" data-action="new-deal" data-contact-id="${esc(contact.id)}">${icon('plus', 14)} New deal for ${esc(contact.name.split(' ')[0])}</button>
        </section>
        <section class="drawer-section">
          <h3>Recent activity</h3>
          ${miniTimeline(activities, ctx, 'No activity yet.')}
        </section>
        ${contact.notes ? `<section class="drawer-section"><h3>Notes</h3><div class="notes-block">${renderNotes(contact.notes)}</div></section>` : ''}
      </div>
      <footer class="drawer-foot">
        <button type="button" class="btn ghost" data-action="edit-contact" data-id="${esc(contact.id)}">${icon('edit', 15)}Edit</button>
        <button type="button" class="btn danger-ghost" data-action="delete" data-kind="contact" data-id="${esc(contact.id)}">${icon('trash', 15)}Delete</button>
      </footer>
    </aside>
  `;
}

/* ─────────────────────────── Chronicle ─────────────────────────── */

function renderChronicle(ctx) {
  const { contacts, deals, activities, now, ui, route } = ctx;
  const contactFilter = route.params.contact || '';
  const filtered = filterActivities(activities, {
    type: ui.chronicleType,
    contactId: contactFilter,
    from: ui.chronicleFrom,
    to: ui.chronicleTo,
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  const page = filtered.slice(0, ui.chronicleLimit);
  const today = calendarKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = calendarKey(yesterdayDate);
  const focused = contactFilter ? contactById(contacts, contactFilter) : null;
  let lastDay = '';
  const rows = page.map((activity, index) => {
    const key = calendarKey(activity.date);
    let separator = '';
    if (key !== lastDay) {
      lastDay = key;
      const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : formatMediumDate(key);
      separator = `<div class="day-separator"><span>${esc(label)}</span></div>`;
    }
    const contact = contactById(contacts, activity.contactId);
    const deal = deals.find((item) => item.id === activity.dealId);
    const long = String(activity.description || '').length > 110;
    return `
      ${separator}
      <article class="entry" data-activity-id="${esc(activity.id)}" data-side="${index % 2 === 0 ? 'left' : 'right'}" data-type="${esc(activity.type)}" style="--tone:${ACTIVITY_COLOR[activity.type]};--i:${index % 20}">
        <span class="entry-dot" aria-hidden="true"></span>
        <div class="entry-head">
          <span class="type-chip">${icon(activity.type, 16)}</span>
          <div class="entry-heading">
            <strong>${esc(activity.title)}</strong>
            <button type="button" class="link-btn" data-link="contact" data-id="${esc(activity.contactId)}">${esc(contact?.name || 'Contact')}</button>
          </div>
          <time datetime="${esc(activity.date)}" title="${esc(formatRelativeTime(activity.date, now))}">${esc(timeOfDay(activity.date))}</time>
        </div>
        ${activity.description ? `<p class="entry-desc ${long ? 'clamp-2' : ''}">${esc(activity.description)}</p>${long ? '<button type="button" class="text-link small" data-action="toggle-desc">Show more</button>' : ''}` : ''}
        <div class="entry-meta">
          ${deal ? `<button type="button" class="deal-ref" data-link="deal" data-id="${esc(deal.id)}">${icon('link', 12)}${esc(truncate(deal.title, 32))}</button>` : ''}
          ${activity.duration ? `<span class="meta-chip">${icon('clock', 12)}${activity.duration} min</span>` : ''}
          ${activity.outcome ? `<span class="meta-chip outcome">→ ${esc(activity.outcome)}</span>` : ''}
        </div>
        <div class="entry-tools">
          <button type="button" class="icon-btn tiny" aria-label="Edit activity" title="Edit" data-action="edit-activity" data-id="${esc(activity.id)}">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn tiny danger" aria-label="Delete activity" title="Delete" data-action="delete" data-kind="activity" data-id="${esc(activity.id)}">${icon('trash', 14)}</button>
        </div>
      </article>
    `;
  }).join('');
  const types = [['all', 'All'], ['call', 'Calls'], ['email', 'Emails'], ['meeting', 'Meetings'], ['note', 'Notes']];
  return `
    <section data-view="chronicle" class="view">
      <header class="view-header stagger">
        <div><p class="eyebrow">Activity Timeline</p><h1>The Chronicle</h1><p class="subtitle">${plural(filtered.length, 'activity', 'activities')}${focused ? ` with ${esc(focused.name)}` : ''}</p></div>
      </header>
      <div class="log-bar stagger">
        ${['call', 'email', 'meeting', 'note'].map((type) => `<button type="button" class="log-btn" data-log="${type}" data-action="quick-log" style="--tone:${ACTIVITY_COLOR[type]}">${icon(type, 20)}<span>${LOG_LABEL[type]}</span></button>`).join('')}
      </div>
      <div class="filter-bar glass stagger">
        <div class="segmented" role="group" aria-label="Activity type">
          ${types.map(([type, label]) => `<button type="button" data-filter-type="${type}" aria-pressed="${ui.chronicleType === type ? 'true' : 'false'}">${label}</button>`).join('')}
        </div>
        <div class="filter-group" role="group" aria-label="Date range">
          <span class="filter-label">${icon('calendar', 14)}</span>
          <input class="mini-input date" type="date" data-field="chronFrom" value="${esc(ui.chronicleFrom)}" aria-label="From date">
          <span class="dash">–</span>
          <input class="mini-input date" type="date" data-field="chronTo" value="${esc(ui.chronicleTo)}" aria-label="To date">
        </div>
        <label class="select-box">${icon('roster', 14)}
          <select data-field="chronContact" aria-label="Filter by contact">
            <option value="">All contacts</option>
            ${[...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((contact) => `<option value="${esc(contact.id)}" ${contact.id === contactFilter ? 'selected' : ''}>${esc(contact.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      ${page.length ? `<div class="timeline" data-timeline>${rows}<div data-timeline-sentinel></div></div>`
        : `<div data-timeline>${emptyState('chronicle', 'No activities here.', activities.length ? 'Try widening the filters.' : 'Use the buttons above to log your first interaction.')}<div data-timeline-sentinel></div></div>`}
    </section>
  `;
}

/* ───────────────────────────── Radar ───────────────────────────── */

function radarRange(ui, now) {
  if (ui.radarRange === 'custom') {
    const start = ui.radarFrom ? new Date(`${ui.radarFrom}T00:00:00`) : null;
    const end = ui.radarTo ? new Date(`${ui.radarTo}T23:59:59`) : null;
    return { start, end };
  }
  return presetRange(ui.radarRange, now);
}

function renderRadar(ctx, currency) {
  const { deals, now, ui, settings } = ctx;
  const range = radarRange(ui, now);
  const summary = winLossModel(deals, range);
  const cohort = deals.filter((deal) => inRange(deal.createdAt, range));
  const funnel = funnelModel(cohort).map((row) => ({ ...row, label: stageLabel(settings, row.stage) }));
  const velocity = velocityModel(deals, now, range).map((row) => ({ ...row, label: stageLabel(settings, row.stage) }));
  const reasons = lostReasons(deals, range);
  const presets = [
    ['this-month', 'This Month'],
    ['last-3-months', 'Last 3 Months'],
    ['last-6-months', 'Last 6 Months'],
    ['this-year', 'This Year'],
    ['all-time', 'All Time'],
  ];
  const key = `${ui.radarRange}:${ui.radarFrom}:${ui.radarTo}`;
  const custom = ui.radarRange === 'custom' || ui.radarCustomOpen;
  return `
    <section data-view="radar" class="view">
      <header class="view-header stagger">
        <div><p class="eyebrow">Analytics &amp; Insights</p><h1>The Radar</h1><p class="subtitle">${plural(cohort.length, 'deal')} created · ${esc(money(summary.wonValue, currency, true))} won in range</p></div>
        <div class="range-control">
          <div class="segmented" role="group" aria-label="Date range">
            ${presets.map(([id, label]) => `<button type="button" data-range="${id}" aria-pressed="${ui.radarRange === id ? 'true' : 'false'}">${label}</button>`).join('')}
            <button type="button" data-action="custom-range" aria-pressed="${ui.radarRange === 'custom' ? 'true' : 'false'}">${icon('calendar', 14)}Custom</button>
          </div>
          ${custom ? `<div class="custom-range">
            <input class="mini-input date" type="date" data-field="radarFrom" value="${esc(ui.radarFrom)}" aria-label="Range start">
            <span class="dash">–</span>
            <input class="mini-input date" type="date" data-field="radarTo" value="${esc(ui.radarTo)}" aria-label="Range end">
          </div>` : ''}
        </div>
      </header>
      <div class="chart-grid">
        <article class="chart-card glass stagger">
          <header class="panel-head"><div><h2>Conversion Funnel</h2><p class="muted small">Share of deals that reached each stage</p></div></header>
          <div class="chart-box">${chart('funnel', `funnel:${key}`, { stages: funnel }, 'Conversion funnel')}</div>
        </article>
        <article class="chart-card glass stagger">
          <header class="panel-head"><div><h2>Revenue Heatmap</h2><p class="muted small">Deal value won per day, last six months</p></div></header>
          <div class="chart-box">${chart('heatmap', `heatmap:${key}`, heatmapModel(deals, now, range), 'Calendar heatmap of revenue won')}</div>
        </article>
        <article class="chart-card glass stagger">
          <header class="panel-head"><div><h2>Pipeline Velocity</h2><p class="muted small">Average days deals spend in each stage</p></div></header>
          <div class="chart-box">${chart('velocity', `velocity:${key}`, { rows: velocity }, 'Average days per stage')}</div>
        </article>
        <article class="chart-card glass stagger winloss-card">
          <header class="panel-head"><div><h2>Win/Loss</h2><p class="muted small">Closed deals in range</p></div></header>
          <div class="donut-wrap">
            <div class="chart-box donut-box">
              ${chart('winloss', `winloss:${key}`, summary, 'Win and loss ratio')}
              <div class="donut-center"><strong>${summary.winRate}%</strong><span>Win rate</span></div>
            </div>
            <div class="donut-side">
              <ul class="legend-list">
                <li><i class="swatch won"></i>Won: ${plural(summary.wonCount, 'deal')} (${esc(money(summary.wonValue, currency, true))})</li>
                <li><i class="swatch lost"></i>Lost: ${plural(summary.lostCount, 'deal')} (${esc(money(summary.lostValue, currency, true))})</li>
              </ul>
              ${reasons.length ? `<div class="reasons"><span class="muted small">Why we lose</span>${reasons.map((row) => `<div class="reason-row"><span>${esc(row.reason)}</span><span class="reason-bar"><span style="width:${(row.count / reasons[0].count) * 100}%"></span></span><span>${row.count}</span></div>`).join('')}</div>` : ''}
            </div>
          </div>
        </article>
      </div>
      <div class="chart-tooltip" data-chart-tooltip data-visible="false"></div>
    </section>
  `;
}

/* ────────────────────────── Customer HQ ────────────────────────── */

function stars(rating, interactive = true) {
  return [1, 2, 3, 4, 5].map((star) => `<button type="button" class="star ${star <= rating ? 'is-on' : ''}" data-rating="${star}" aria-pressed="${rating === star ? 'true' : 'false'}" aria-label="${star} star${star === 1 ? '' : 's'}" ${interactive ? '' : 'disabled'}>${icon('star', 18)}</button>`).join('');
}

function renderCustomers(ctx, currency) {
  const { contacts, customers, orders, ui } = ctx;
  const visible = filterCustomers(customers, contacts, ui.customerQuery);
  const selected = customers.find((customer) => customer.id === ui.selectedCustomerId) ?? null;
  const totalRevenue = customers.reduce((sum, customer) => sum + customerStats(orders.filter((order) => order.customerId === customer.id)).revenue, 0);
  return `
    <section data-view="customers" class="view">
      <header class="view-header stagger">
        <div><p class="eyebrow">Post-conversion</p><h1>Customer HQ</h1><p class="subtitle">${plural(customers.length, 'customer')} · ${esc(money(totalRevenue, currency, true))} lifetime revenue</p></div>
      </header>
      <div class="split">
        <aside class="customer-list glass stagger">
          <label class="search-box">${icon('search', 16)}<input data-search type="search" placeholder="Search customers" value="${esc(ui.customerQuery)}" aria-label="Search customers"></label>
          <div class="customer-items" data-scroll-key="customer-list">
            ${visible.map((customer) => {
              const contact = contactById(contacts, customer.contactId);
              const mine = orders.filter((order) => order.customerId === customer.id);
              const stats = customerStats(mine);
              return `
                <button type="button" class="customer-item" data-customer-id="${esc(customer.id)}" ${customer.id === ui.selectedCustomerId ? 'data-selected="true"' : ''}>
                  <span class="ci-head">${avatar(contact?.name || '')}<span class="ci-name"><strong>${esc(contact?.name || 'Unknown')}</strong><span class="secondary">${esc(contact?.company || '')}</span></span></span>
                  <span class="ci-stats">
                    <span><small>Lifetime revenue</small><b>${esc(money(stats.revenue, currency, true))}</b></span>
                    <span><small>Orders</small><b>${stats.orderCount}</b></span>
                    <canvas data-sparkline data-chart-key="spark:${esc(customer.id)}" data-model="${esc(JSON.stringify({ values: sparklineValues(mine) }))}" aria-hidden="true"></canvas>
                  </span>
                </button>`;
            }).join('') || `<p class="muted small pad">${customers.length ? 'No customers match.' : 'Win a deal to create your first customer.'}</p>`}
          </div>
        </aside>
        <div class="customer-detail-wrap stagger">${selected ? renderCustomerDetail(selected, ctx, currency)
          : `<div class="glass panel">${emptyState('customers', 'No customers yet.', 'When a deal is won you can convert the contact into a customer.')}</div>`}</div>
      </div>
      <div class="chart-tooltip" data-chart-tooltip data-visible="false"></div>
    </section>
  `;
}

function renderCustomerDetail(customer, ctx, currency) {
  const contact = contactById(ctx.contacts, customer.contactId);
  const orders = ctx.orders.filter((order) => order.customerId === customer.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const stats = customerStats(orders);
  const tab = ctx.ui.customerTab;
  const rating = Number(customer.satisfactionRating || 0);
  const tabs = [['orders', 'Orders'], ['pipeline', 'Pipeline'], ['notes', 'Notes'], ['activity', 'Activity']];
  const openDeals = openDealsForContact(ctx.deals, customer.contactId);
  const activity = ctx.activities.filter((item) => item.contactId === customer.contactId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return `
    <article class="customer-detail glass" data-customer-detail="${esc(customer.id)}">
      <header class="customer-head">
        ${avatar(contact?.name || '', 'xl')}
        <div class="customer-title">
          <h2>${esc(contact?.name || 'Unknown')}</h2>
          <p class="secondary">${esc(contact?.company || '')}</p>
          <p class="muted small">Customer since ${esc(formatMediumDate(calendarKey(customer.convertedAt)))}</p>
        </div>
        <div class="rating">
          <span class="rating-label">${rating ? `${rating}/5 satisfaction` : 'Rate satisfaction'}</span>
          <div class="stars" role="group" aria-label="Satisfaction rating">${stars(rating)}</div>
        </div>
      </header>
      <div class="stats">
        <article class="stat" data-stat="revenue"><span>Total Revenue</span>${counter(`rev:${customer.id}`, stats.revenue, 'money', money(stats.revenue, currency))}</article>
        <article class="stat" data-stat="orders"><span>Total Orders</span>${counter(`orders:${customer.id}`, stats.orderCount, 'int', String(stats.orderCount))}</article>
        <article class="stat" data-stat="average"><span>Average Order Value</span>${counter(`avg:${customer.id}`, Math.round(stats.average), 'money', money(stats.average, currency))}</article>
        <article class="stat" data-stat="last-order"><span>Last Order Date</span><strong class="num">${esc(stats.lastOrderDate ? formatMediumDate(stats.lastOrderDate) : '—')}</strong></article>
      </div>
      <div class="tabs" role="tablist">
        ${tabs.map(([name, label]) => `<button type="button" role="tab" data-tab="${name}" aria-selected="${tab === name ? 'true' : 'false'}">${label}${name === 'pipeline' && openDeals.length ? ` <span class="count-pill">${openDeals.length}</span>` : ''}</button>`).join('')}
      </div>
      ${tab === 'orders' ? `
        <div class="tab-panel" data-tab-panel="orders">
          <div class="tab-panel-head"><h3>Order history</h3><button type="button" class="btn emerald" data-action="new-order">${icon('plus', 16)}New Order</button></div>
          ${orders.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Description</th><th class="num-col">Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${orders.map((order) => `<tr><td>${esc(formatMediumDate(order.date))}</td><td>${esc(order.description)}</td><td class="num-col">${esc(money(order.amount, currency))}</td><td><span class="badge" data-status="${esc(order.status)}">${esc(order.status)}</span></td></tr>`).join('')}
            </tbody>
          </table></div>` : '<p class="muted small">No orders yet.</p>'}
        </div>` : ''}
      ${tab === 'pipeline' ? `
        <div class="tab-panel" data-tab-panel="pipeline">
          <div class="tab-panel-head"><h3>Upsell &amp; renewal deals</h3><button type="button" class="btn primary" data-action="new-deal" data-contact-id="${esc(customer.contactId)}">${icon('plus', 16)}New Deal</button></div>
          ${openDeals.length ? `<div class="mini-deals">${openDeals.map((deal) => `
            <button type="button" class="mini-deal" data-link="deal" data-id="${esc(deal.id)}" style="--tone:${STAGE_COLOR[deal.stage]}">
              <strong>${esc(deal.title)}</strong><span class="mini-deal-value">${esc(money(deal.value, currency, true))}</span>${stageBadge(ctx.settings, deal.stage)}
            </button>`).join('')}</div>` : '<p class="muted small">No open deals.</p>'}
        </div>` : ''}
      ${tab === 'notes' ? `
        <div class="tab-panel notes-panel" data-tab-panel="notes">
          <label class="field"><span>Notes <em class="muted small">Supports **bold**, *italic* and - lists. Saves when you click away.</em></span>
            <textarea data-notes data-customer-id="${esc(customer.id)}" rows="6">${esc(customer.notes || '')}</textarea>
          </label>
          <div class="notes-preview"><span class="muted small">Preview</span>${customer.notes ? renderNotes(customer.notes) : '<p class="muted">Nothing yet.</p>'}</div>
        </div>` : ''}
      ${tab === 'activity' ? `
        <div class="tab-panel" data-tab-panel="activity">
          ${quickLogButtons(customer.contactId)}
          ${miniTimeline(activity, ctx, 'No activity yet.')}
        </div>` : ''}
    </article>
  `;
}

/* ─────────────────────────── Settings ─────────────────────────── */

function renderSettings(ctx) {
  const { settings, tags, ui, contacts, deals, activities } = ctx;
  return `
    <section data-view="settings" class="view">
      <header class="view-header stagger"><div><p class="eyebrow">Configuration</p><h1>Settings</h1></div></header>
      <div class="settings-grid">
        <section class="panel glass stagger">
          <header class="panel-head"><h2>Profile</h2></header>
          <label class="field"><span>Your name</span><input data-field="userName" value="${esc(settings.userName === 'there' ? '' : settings.userName || '')}" placeholder="Used in your greeting"></label>
          <label class="field"><span>Currency symbol</span><input data-field="currency" value="${esc(settings.currency || '₹')}" maxlength="4"></label>
        </section>
        <section class="panel glass stagger">
          <header class="panel-head"><h2>Pipeline Stages</h2></header>
          <div class="stage-names">
            ${(settings.stages || []).map((stage) => `<label class="field inline" style="--tone:${STAGE_COLOR[stage.id]}"><span><i class="stage-dot"></i>${esc(stage.id)}</span><input data-stage-id="${esc(stage.id)}" value="${esc(stage.name)}"></label>`).join('')}
          </div>
        </section>
        <section class="panel glass stagger">
          <header class="panel-head"><h2>Tags</h2><span class="count-pill">${tags.length}</span></header>
          <ul class="tag-list">${tags.map((tag) => `
            <li>
              <input type="color" class="color-swatch" data-tag-color="${esc(tag.id)}" value="${esc(tag.color || '#6366f1')}" aria-label="Color for ${esc(tag.name)}">
              <input class="tag-name" data-tag-name="${esc(tag.id)}" value="${esc(tag.name)}" aria-label="Tag name">
              <button type="button" class="icon-btn tiny danger" data-action="delete" data-kind="tag" data-id="${esc(tag.id)}" aria-label="Delete ${esc(tag.name)}">${icon('trash', 14)}</button>
            </li>`).join('')}
          </ul>
          <div class="tag-add">
            <input type="color" class="color-swatch" data-field="tagColor" value="#6366f1" aria-label="New tag color">
            <input data-field="tagName" value="" placeholder="New tag name" aria-label="New tag name">
            <button type="button" class="btn primary small" data-action="add-tag">Add tag</button>
          </div>
          ${ui.tagError ? `<p class="field-error" data-error-for="tagName">${esc(ui.tagError)}</p>` : ''}
        </section>
        <section class="panel glass stagger">
          <header class="panel-head"><h2>Data Management</h2></header>
          <p class="muted small">${plural(contacts.length, 'contact')}, ${plural(deals.length, 'deal')}, ${plural(activities.length, 'activity', 'activities')} stored in this browser.</p>
          <div class="data-actions">
            <button type="button" class="btn ghost" data-action="export">${icon('download', 16)}Export All Data</button>
            <label class="btn ghost file-btn">${icon('upload', 16)}Import Data<input type="file" data-field="import" accept="application/json,.json"></label>
            <button type="button" class="btn ghost" data-action="reset-demo">${icon('refresh', 16)}Reset Demo Data</button>
            <button type="button" class="btn danger-ghost" data-action="clear-all">${icon('trash', 16)}Clear All Data</button>
          </div>
        </section>
        <section class="panel glass stagger">
          <header class="panel-head"><h2>Keyboard Shortcuts</h2></header>
          ${shortcutList()}
        </section>
      </div>
    </section>
  `;
}

function shortcutList() {
  const rows = [
    [['1', '–', '6'], 'Jump to Briefing, Pipeline, Roster, Chronicle, Radar, Customers'],
    [['N'], 'New item for the current view'],
    [['/'], 'Search'],
    [['Esc'], 'Escape: close any modal or panel'],
    [['?'], 'Keyboard shortcuts'],
  ];
  return `<ul class="shortcut-list">${rows.map(([keys, label]) => `<li><span class="keys">${keys.map((key) => (key === '–' ? '<span class="muted">–</span>' : `<kbd>${key}</kbd>`)).join('')}</span><span>${esc(label)}</span></li>`).join('')}</ul>`;
}

/* ─────────────────────────── Overlays ─────────────────────────── */

export function renderOverlay(ctx) {
  const { ui } = ctx;
  if (ui.confirm) {
    const tone = ui.confirm.tone || 'danger';
    return `
      <div data-overlay class="overlay">
        <div role="alertdialog" class="modal confirm" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" data-tone-style="${tone}">
          <div class="confirm-icon">${icon(tone === 'danger' ? 'warning' : 'refresh', 22)}</div>
          <h2 id="confirm-title">${esc(ui.confirm.title || 'Are you sure?')}</h2>
          <p id="confirm-message">${esc(ui.confirm.message)}</p>
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-action="confirm-no">Cancel</button>
            <button type="button" class="btn ${tone === 'danger' ? 'danger' : 'primary'}" data-action="confirm-yes">${esc(ui.confirm.yes)}</button>
          </div>
        </div>
      </div>`;
  }
  if (ui.help) {
    return `
      <div data-overlay class="overlay">
        <div role="dialog" class="modal" aria-modal="true" aria-labelledby="help-title">
          <header class="modal-head"><span class="modal-icon">${icon('keyboard')}</span><h2 id="help-title">Keyboard shortcuts</h2><button type="button" class="icon-btn" data-action="cancel-modal" aria-label="Close">${icon('close')}</button></header>
          <div class="modal-body">
            <ul class="shortcut-list">
              ${NAV.map(([, label], index) => `<li><span class="keys"><kbd>${index + 1}</kbd></span><span>${label}</span></li>`).join('')}
              <li><span class="keys"><kbd>N</kbd></span><span>New item for the current view</span></li>
              <li><span class="keys"><kbd>/</kbd></span><span>Search</span></li>
              <li><span class="keys"><kbd>Esc</kbd></span><span>Escape: close any modal or panel</span></li>
              <li><span class="keys"><kbd>?</kbd></span><span>Show this help</span></li>
            </ul>
          </div>
          <footer class="modal-actions"><button type="button" class="btn primary" data-action="cancel-modal">Close</button></footer>
        </div>
      </div>`;
  }
  if (!ui.modal) return '';
  return renderModal(ctx);
}

function field(label, control, { required = false, wide = false } = {}) {
  return `<label class="field ${wide ? 'wide' : ''}"><span>${esc(label)}${required ? ' <em class="req">*</em>' : ''}</span>${control}</label>`;
}

function contactPicker(contacts, selectedId, fieldName = 'contact') {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="picker">
    <input type="search" class="picker-search" data-picker-for="${fieldName}" placeholder="Type to filter contacts…" aria-label="Filter contacts">
    <select data-field="${fieldName}" size="1"><option value="">Select a contact</option>${sorted.map((contact) => `<option value="${esc(contact.id)}" ${selectedId === contact.id ? 'selected' : ''}>${esc(contact.name)}${contact.company ? ` — ${esc(contact.company)}` : ''}</option>`).join('')}</select>
  </div>`;
}

function localDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderModal(ctx) {
  const { ui, contacts, deals, tags, settings } = ctx;
  const modal = ui.modal;
  const editing = Boolean(modal.id);
  const openedAt = modal.openedAt ? new Date(modal.openedAt) : ctx.now;
  let title = 'Edit';
  let iconName = 'edit';
  let body = '';
  let actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button><button type="button" class="btn primary" data-action="save-modal">Save</button>`;

  if (modal.type === 'contact') {
    const c = modal.id ? contacts.find((item) => item.id === modal.id) ?? {} : {};
    title = editing ? 'Edit Contact' : 'Add Contact';
    iconName = 'roster';
    body = `<div class="form-grid">
      ${field('Name', `<input data-field="name" value="${esc(c.name || '')}" placeholder="Full name" autocomplete="off">`, { required: true, wide: true })}
      ${field('Email', `<input data-field="email" type="email" value="${esc(c.email || '')}" placeholder="name@company.com">`)}
      ${field('Phone', `<input data-field="phone" value="${esc(c.phone || '')}" placeholder="+91 …">`)}
      ${field('Company', `<input data-field="company" value="${esc(c.company || '')}">`)}
      ${field('Title', `<input data-field="title" value="${esc(c.title || '')}" placeholder="e.g. CTO">`)}
      ${editing ? field('Status', `<select data-field="status">${['prospect', 'active', 'customer', 'inactive'].map((status) => `<option value="${status}" ${c.status === status ? 'selected' : ''}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join('')}</select>`) : ''}
      ${field('Source', `<input data-field="source" value="${esc(c.source || '')}" placeholder="Referral, conference…">`)}
      <div class="field wide"><span>Tags</span><div class="tag-picker" data-field="tags">${tags.map((tag) => `<label class="tag-option" style="--tag:${esc(tag.color)}"><input type="checkbox" data-tag-option value="${esc(tag.id)}" ${(c.tags || []).includes(tag.id) ? 'checked' : ''}><span>${esc(tag.name)}</span></label>`).join('') || '<span class="muted small">No tags yet — create them in Settings.</span>'}</div></div>
      ${field('Notes', `<textarea data-field="notes" rows="3">${esc(c.notes || '')}</textarea>`, { wide: true })}
    </div>`;
  } else if (modal.type === 'deal') {
    const d = modal.id ? deals.find((item) => item.id === modal.id) ?? {} : {};
    const stage = d.stage || modal.preset?.stage || 'prospect';
    title = editing ? 'Edit Deal' : 'New Deal';
    iconName = 'pipeline';
    body = `<div class="form-grid">
      ${field('Title', `<input data-field="title" value="${esc(d.title || '')}" placeholder="What are you selling?" autocomplete="off">`, { required: true, wide: true })}
      ${field('Contact', contactPicker(contacts, d.contactId || modal.preset?.contactId || ''), { required: true, wide: true })}
      ${field('Value', `<input data-field="value" type="number" min="0" step="1000" value="${esc(d.value ?? '')}" placeholder="0">`, { required: true })}
      ${field('Stage', `<select data-field="stage">${STAGES.filter((s) => editing || s !== 'lost').map((s) => `<option value="${s}" ${s === stage ? 'selected' : ''}>${esc(stageLabel(settings, s))}</option>`).join('')}</select>`)}
      ${field('Expected Close Date', `<input data-field="expectedCloseDate" type="date" value="${esc(d.expectedCloseDate || '')}">`)}
      ${field('Priority', `<select data-field="priority">${PRIORITIES.slice().reverse().map((p) => `<option value="${p}" ${(d.priority || 'medium') === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select>`)}
      ${field('Probability %', `<input data-field="probability" type="number" min="0" max="100" value="${esc(editing ? d.probability ?? '' : '')}" placeholder="Auto (${STAGE_PROBABILITY[stage]}%)">`)}
      ${editing && d.stage === 'lost' ? field('Lost reason', `<input data-field="lostReason" value="${esc(d.lostReason || '')}">`) : ''}
      ${field('Notes', `<textarea data-field="notes" rows="3">${esc(d.notes || '')}</textarea>`, { wide: true })}
    </div>`;
  } else if (modal.type === 'activity') {
    const a = modal.id ? ctx.activities.find((item) => item.id === modal.id) ?? {} : {};
    const type = a.type || modal.activityType || 'call';
    const contactId = a.contactId || modal.preset?.contactId || '';
    const dealId = a.dealId || modal.preset?.dealId || '';
    title = editing ? `Edit ${ACTIVITY_LABEL[type]}` : LOG_LABEL[type];
    iconName = type;
    const showDuration = type === 'call' || type === 'meeting';
    body = `<div class="form-grid" style="--tone:${ACTIVITY_COLOR[type]}">
      ${field('Contact', contactPicker(contacts, contactId), { required: true, wide: true })}
      ${field('Deal', `<select data-field="deal"><option value="">No deal</option>${deals.map((deal) => `<option value="${esc(deal.id)}" data-contact="${esc(deal.contactId)}" ${dealId === deal.id ? 'selected' : ''} ${contactId && deal.contactId !== contactId ? 'hidden disabled' : ''}>${esc(deal.title)}</option>`).join('')}</select>`, { wide: true })}
      ${field('Title', `<input data-field="title" value="${esc(a.title || '')}" placeholder="${type === 'note' ? 'Quick summary' : 'What happened?'}" autocomplete="off">`, { required: true, wide: true })}
      ${field('Description', `<textarea data-field="description" rows="3">${esc(a.description || '')}</textarea>`, { wide: true })}
      ${field('Date & time', `<input data-field="date" type="datetime-local" value="${esc(localDateTime(a.date || openedAt))}">`, { required: true })}
      ${showDuration ? field('Duration (minutes)', `<input data-field="duration" type="number" min="0" value="${esc(a.duration ?? '')}">`) : ''}
      ${field('Outcome', `<input data-field="outcome" value="${esc(a.outcome || '')}" placeholder="Next step or result">`, { wide: !showDuration })}
    </div>`;
  } else if (modal.type === 'order') {
    title = 'New Order';
    iconName = 'customers';
    body = `<div class="form-grid">
      ${field('Description', `<input data-field="description" value="" placeholder="What was ordered?">`, { required: true, wide: true })}
      ${field('Amount', `<input data-field="amount" type="number" min="0" value="">`, { required: true })}
      ${field('Date', `<input data-field="date" type="date" value="${esc(calendarKey(openedAt))}">`, { required: true })}
      ${field('Status', `<select data-field="status"><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select>`)}
      ${field('Notes', `<textarea data-field="notes" rows="2"></textarea>`, { wide: true })}
    </div>`;
    actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button><button type="button" class="btn emerald" data-action="save-modal">Save</button>`;
  } else if (modal.type === 'lost') {
    title = 'Why was this deal lost?';
    iconName = 'warning';
    body = `
      <p class="muted">Capturing the reason feeds the Win/Loss analysis on the Radar.</p>
      <div class="reason-chips">${LOST_REASONS.map((reason) => `<button type="button" class="chip-btn" data-action="pick-reason" data-reason="${esc(reason)}">${esc(reason)}</button>`).join('')}</div>
      ${field('Lost reason', `<input data-field="lostReason" value="" placeholder="Pick one above or describe it">`, { required: true, wide: true })}`;
  } else if (modal.type === 'convert') {
    title = 'Deal won';
    iconName = 'customers';
    body = `<p class="lead">${esc(conversionMessage(modal.name))}</p><p class="muted">They'll move to Customer HQ with this deal recorded as their first order.</p>`;
    actions = `<button type="button" class="btn ghost" data-action="convert-no">No</button><button type="button" class="btn emerald" data-action="convert-yes">Yes</button>`;
  } else if (modal.type === 'import') {
    title = 'Import backup';
    iconName = 'upload';
    body = `<p>${esc(modal.preview)}</p><div class="warning-box">${icon('warning', 18)}<span>${esc(IMPORT_WARNING)}</span></div>`;
    actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button><button type="button" class="btn danger" data-action="replace-import">Replace all data</button>`;
  }

  return `
    <div data-overlay class="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-type="${esc(modal.type)}">
        <header class="modal-head">
          <span class="modal-icon">${icon(iconName)}</span>
          <h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-action="cancel-modal" aria-label="Close">${icon('close')}</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-actions">${actions}</footer>
      </div>
    </div>
  `;
}
