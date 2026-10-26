import { avatarGradient, formatMoney, formatMoneyCompact, initials } from './format.js';
import { esc, icon } from './markup.js';
import { companyOf } from './companies.js';
import { dueLabel, dueTone, shortDue } from './agenda.js';

export const STAGE_COLOR = {
  prospect: '#38bdf8',
  qualified: '#3b82f6',
  proposal: '#8b5cf6',
  negotiation: '#d946ef',
  closing: '#f59e0b',
  won: '#10b981',
  lost: '#ef4444',
};

export const ACTIVITY_COLOR = {
  call: '#3b82f6',
  email: '#10b981',
  meeting: '#8b5cf6',
  note: '#64748b',
  whatsapp: '#22c55e',
  task: '#06b6d4',
};
export const ACTIVITY_LABEL = { call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note', whatsapp: 'WhatsApp', task: 'Task' };
export const LOG_LABEL = { call: 'Log Call', email: 'Log Email', meeting: 'Log Meeting', note: 'Add Note', whatsapp: 'Log WhatsApp', task: 'Log Task' };
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const PRIORITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <defs><linearGradient id="nx-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
    <path d="M6 26V6l20 20V6" fill="none" stroke="url(#nx-grad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function money(amount, currency, compact = false) {
  return compact ? formatMoneyCompact(amount, currency) : formatMoney(amount, currency);
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function timeOfDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function contactById(contacts, id) {
  return (contacts ?? []).find((contact) => contact.id === id) ?? null;
}

export function companyById(companies, id) {
  return (companies ?? []).find((company) => company.id === id) ?? null;
}

export function companyName(contact, companies) {
  return companyOf(contact, companies)?.name || contact?.company || '';
}

export function roleLine(contact, companies) {
  return [contact?.title, companyName(contact, companies)].filter(Boolean).join(' at ');
}

export function avatar(name, size = '') {
  return `<span class="avatar ${size}" style="background:${avatarGradient(name || '?')}">${esc(initials(name || '?'))}</span>`;
}

export function companyAvatar(name, size = '') {
  return `<span class="avatar company-avatar ${size}" style="--company:${avatarGradient(name || '?')}">${icon('building', size === 'lg' || size === 'xl' ? 20 : 15)}</span>`;
}

export function avatarStack(contacts, limit = 4) {
  if (!contacts.length) return '';
  const shown = contacts.slice(0, limit);
  const extra = contacts.length - shown.length;
  return `<span class="avatar-stack" title="${esc(contacts.map((contact) => contact.name).join(', '))}">${shown.map((contact) => avatar(contact.name, 'xs')).join('')}${extra > 0 ? `<span class="avatar xs more">+${extra}</span>` : ''}</span>`;
}

export function activityIcon(activity) {
  return activity?.source === 'voice' ? 'mic' : activity?.type;
}

export function activityLabel(activity) {
  if (activity?.source === 'voice') return 'Voice note';
  if (activity?.status === 'planned') return `Planned ${String(ACTIVITY_LABEL[activity.type] || 'step').toLowerCase()}`;
  return ACTIVITY_LABEL[activity?.type] || 'Activity';
}

export function emptyState(iconName, title, body, action = '') {
  return `<div class="empty-state">${icon(iconName, 22)}<strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</div>`;
}

export function field(label, control, { required = false, wide = false, hint = '' } = {}) {
  return `<label class="field ${wide ? 'wide' : ''}"><span>${esc(label)}${required ? ' <em class="req">*</em>' : ''}</span>${control}${hint}</label>`;
}

export function contactPicker(contacts, selectedId, fieldName = 'contact', companies = []) {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="picker">
    <input type="search" class="picker-search" data-picker-for="${fieldName}" placeholder="Type to filter contacts…" aria-label="Filter contacts">
    <select data-field="${fieldName}" size="1"><option value="">Select a contact</option>${sorted.map((contact) => {
      const company = companyName(contact, companies);
      return `<option value="${esc(contact.id)}" data-company="${esc(companyOf(contact, companies)?.id || '')}" ${selectedId === contact.id ? 'selected' : ''}>${esc(contact.name)}${company ? ` — ${esc(company)}` : ''}</option>`;
    }).join('')}</select>
  </div>`;
}

export function companyHint(value, companies) {
  const name = String(value ?? '').trim();
  if (!name) return '';
  const match = (companies ?? []).find((company) => company.name.trim().toLowerCase() === name.toLowerCase());
  return match ? `Links to ${esc(match.name)}` : `A new company “${esc(name)}” will be created`;
}

/** Deals selectable for an activity: those the contact is on, or any deal at their company. */
export function dealSelect(deals, contacts, companies, contactId, dealId) {
  const contactCompany = companyOf(contactById(contacts, contactId), companies)?.id || '';
  return `<select data-field="deal"><option value="">No deal</option>${deals.map((deal) => {
    const people = [deal.contactId, ...(deal.stakeholders || []).map((item) => item.contactId)];
    const companyId = deal.companyId || companyOf(contactById(contacts, deal.contactId), companies)?.id || '';
    const mismatch = contactId && !people.includes(contactId) && !(companyId && companyId === contactCompany);
    return `<option value="${esc(deal.id)}" data-contact="${esc(deal.contactId)}" data-people="${esc(people.join(' '))}" data-company="${esc(companyId)}" ${dealId === deal.id ? 'selected' : ''} ${mismatch ? 'hidden disabled' : ''}>${esc(deal.title)}</option>`;
  }).join('')}</select>`;
}

export function localDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function modalFrame({ type, title, iconName, body, actions, variant = '', tone = '' }) {
  return `
    <div data-overlay class="overlay ${variant ? `overlay-${variant}` : ''}">
      <div class="modal ${variant}" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-type="${esc(type)}" ${tone ? `style="--tone:${tone}"` : ''}>
        <header class="modal-head">
          <span class="modal-icon">${icon(iconName)}</span>
          <h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-action="cancel-modal" aria-label="Close">${icon('close')}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${actions ? `<footer class="modal-actions">${actions}</footer>` : ''}
      </div>
    </div>
  `;
}

/** Compact "Next: title · Tue" chip for cards; a dashed prompt when nothing is planned. */
export function nextStepChip(step, now, { dealId = '', contactId = '', companyId = '' } = {}) {
  const refs = `${dealId ? `data-deal-ref="${esc(dealId)}"` : ''} ${contactId ? `data-contact-ref="${esc(contactId)}"` : ''} ${companyId ? `data-company-ref="${esc(companyId)}"` : ''}`;
  if (!step) {
    return `<button type="button" class="next-chip is-empty" data-action="plan-step" ${refs} title="Plan the next step">${icon('flag', 12)}<span>Plan next step</span></button>`;
  }
  const tone = dueTone(step.date, now);
  return `<button type="button" class="next-chip" data-due="${tone}" data-action="edit-activity" data-id="${esc(step.id)}" title="${esc(`${step.title} · ${dueLabel(step.date, now)}`)}">${icon(tone === 'overdue' ? 'warning' : 'flag', 12)}<span class="next-chip-title">${esc(step.title)}</span><span class="next-chip-due">${esc(shortDue(step.date, now))}</span></button>`;
}

/** Call / Message / Plan / Voice buttons shared by drawers and detail views. */
export function contactActions({ contactId = '', dealId = '', companyId = '' } = {}, { phone = true } = {}) {
  const refs = `${contactId ? `data-contact-ref="${esc(contactId)}"` : ''} ${dealId ? `data-deal-ref="${esc(dealId)}"` : ''} ${companyId ? `data-company-ref="${esc(companyId)}"` : ''}`;
  return `<div class="action-row">
    ${phone ? `<button type="button" class="action-btn" data-action="call-sheet" ${refs}>${icon('call', 16)}<span>Call</span></button>` : ''}
    <button type="button" class="action-btn whatsapp" data-action="compose" ${refs}>${icon('whatsapp', 16)}<span>Message</span></button>
    <button type="button" class="action-btn" data-action="plan-step" ${refs}>${icon('flag', 16)}<span>Next step</span></button>
    <button type="button" class="action-btn" data-action="voice-note" ${refs}>${icon('mic', 16)}<span>Voice note</span></button>
  </div>`;
}

export function excelBlock({ canImport, hasRecords, importNote = '' }) {
  return `
    <div class="excel-block" data-region="excel">
      <h3>${icon('sheet', 16)}Excel</h3>
      <p class="muted small">Add or edit records in bulk in Excel, Numbers or Google Sheets. Rows with an ID update that record; rows without one are added.</p>
      <div class="data-actions">
        <button type="button" class="btn ghost" data-action="excel-template">${icon('download', 16)}Blank template</button>
        <button type="button" class="btn ghost" data-action="excel-export"${hasRecords ? '' : ' disabled'}>${icon('download', 16)}Export with records</button>
        ${canImport ? `<label class="btn ghost file-btn">${icon('upload', 16)}Import from Excel<input type="file" data-field="excel-import" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>` : ''}
      </div>
      ${importNote ? `<p class="muted small">${esc(importNote)}</p>` : ''}
    </div>`;
}

const EXCEL_ROWS = [
  ['companies', 'Companies'],
  ['contacts', 'Contacts'],
  ['deals', 'Deals'],
  ['activities', 'Activities'],
  ['customers', 'Customers'],
  ['orders', 'Orders'],
  ['tags', 'Tags'],
];
const PROBLEMS_SHOWN = 50;

export function excelPreview(modal) {
  const { counts, problems, warnings, changes, rows } = modal.plan;
  if (modal.busy) {
    const { done, total } = modal.busy;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return `
      <p>Saving ${esc(done.toLocaleString())} of ${esc(total.toLocaleString())} changes…</p>
      <div class="excel-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
      <p class="muted small">Keep this tab open until it finishes.</p>`;
  }
  const lines = EXCEL_ROWS.filter(([key]) => counts[key] && (counts[key].created || counts[key].updated || counts[key].unchanged));
  const number = (value) => (value ? esc(value.toLocaleString()) : '<span class="muted">–</span>');
  return `
    <p class="muted small">${esc(modal.fileName)} · ${esc(plural(rows, 'row'))} read</p>
    ${lines.length ? `<table class="excel-summary">
      <thead><tr><th scope="col">Records</th><th scope="col">New</th><th scope="col">Updated</th><th scope="col">Unchanged</th></tr></thead>
      <tbody>${lines.map(([key, label]) => `<tr data-collection="${key}"><th scope="row">${label}</th><td>${number(counts[key].created)}</td><td>${number(counts[key].updated)}</td><td>${number(counts[key].unchanged)}</td></tr>`).join('')}</tbody>
    </table>` : ''}
    ${!changes && !problems.length ? '<p>Everything in this file already matches NEXUS, so there is nothing to import.</p>' : ''}
    ${problems.length ? `<div class="warning-box excel-problems">${icon('warning', 18)}<div>
      <strong>${esc(plural(problems.length, 'row'))} ${problems.length === 1 ? 'has a problem and' : 'have problems and'} will be skipped</strong>
      <ul>${problems.slice(0, PROBLEMS_SHOWN).map((problem) => `<li>${problem.sheet ? `<span class="excel-where">${esc(problem.sheet)} row ${esc(problem.row)}</span> ` : ''}${esc(problem.message)}</li>`).join('')}</ul>
      ${problems.length > PROBLEMS_SHOWN ? `<p class="small">…and ${esc((problems.length - PROBLEMS_SHOWN).toLocaleString())} more. Fix these in the file and import it again; rows already imported will show as unchanged.</p>` : ''}
    </div></div>` : ''}
    ${warnings.length ? `<ul class="excel-warnings muted small">${warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>` : ''}
    ${changes ? '<p class="muted small">Nothing is deleted. Records not in the file stay as they are.</p>' : ''}`;
}
