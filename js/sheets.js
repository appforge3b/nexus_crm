import { esc, icon } from './markup.js';
import { companyOf, peopleAt, stakeholdersFor } from './companies.js';
import { PLAN_TYPES, clockTime, defaultPlanDate, doneOnly, dueLabel, nextStepForContact, nextStepForDeal, shortDate } from './agenda.js';
import { hasDialableNumber, mailtoLink, renderTemplate, telLink, templateVars, templatesFrom, waLink } from './messaging.js';
import { formatClock, suggestTitle } from './voice.js';
import {
  ACTIVITY_COLOR,
  ACTIVITY_LABEL,
  avatar,
  companyById,
  companyName,
  contactById,
  contactPicker,
  dealSelect,
  field,
  localDateTime,
  modalFrame,
} from './view-helpers.js';

export const SHEET_TYPES = ['plan', 'complete', 'message', 'call', 'voice'];

const TITLE_IDEAS = ['Present GTM deck', 'Follow up', 'Send proposal', 'Product demo', 'Contract review', 'Pricing discussion'];

const WHEN_PRESETS = [
  ['later-today', 'Later today'],
  ['tomorrow', 'Tomorrow 10 AM'],
  ['in-3-days', 'In 3 days'],
  ['next-week', 'Next week'],
];

/** People to offer for a deal, company, or contact: stakeholders first, then colleagues. */
export function candidatePeople({ contactId = '', dealId = '', companyId = '' } = {}, { contacts = [], deals = [], companies = [] } = {}) {
  const seen = new Set();
  const list = [];
  const add = (contact, note = '') => {
    if (!contact || seen.has(contact.id)) return;
    seen.add(contact.id);
    list.push({ contact, note: note || contact.title || '' });
  };
  const deal = dealId ? deals.find((item) => item.id === dealId) : null;
  if (deal) for (const entry of stakeholdersFor(deal, contacts)) add(entry.contact, entry.role);
  const anchor = contactById(contacts, contactId);
  if (anchor) add(anchor);
  const company = companyById(companies, companyId) || companyOf(anchor, companies)
    || companyOf(contactById(contacts, deal?.contactId), companies);
  if (company) for (const person of peopleAt(company, contacts, companies)) add(person);
  return list;
}

export function whenPreset(preset, now) {
  const at = (days, hour, minute = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute, 0, 0);
  if (preset === 'later-today') {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(Math.min(now.getHours() + 2, 23));
    return next;
  }
  if (preset === 'in-3-days') return at(3, 10);
  if (preset === 'next-week') {
    const daysToMonday = ((8 - now.getDay()) % 7) || 7;
    return at(daysToMonday, 10);
  }
  return at(1, 10);
}

function draftOf(modal) {
  return modal.draft || {};
}

function recentContacts(ctx, limit = 5) {
  const ids = [];
  for (const activity of doneOnly(ctx.activities).sort((a, b) => new Date(b.date) - new Date(a.date))) {
    if (activity.contactId && !ids.includes(activity.contactId)) ids.push(activity.contactId);
    if (ids.length >= limit) break;
  }
  return ids.map((id) => contactById(ctx.contacts, id)).filter(Boolean);
}

function personChip(contact, note, selected, action = 'pick-recipient') {
  return `<button type="button" class="recipient ${selected ? 'is-on' : ''}" data-action="${action}" data-contact-ref="${esc(contact.id)}" aria-pressed="${selected ? 'true' : 'false'}">
    ${avatar(contact.name, 'xs')}<span><strong>${esc(contact.name)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</span>
  </button>`;
}

/* ───────────── Plan next step ───────────── */

function renderPlan(ctx) {
  const modal = ctx.ui.modal;
  const draft = draftOf(modal);
  const existing = modal.id ? ctx.activities.find((item) => item.id === modal.id) ?? {} : {};
  const openedAt = modal.openedAt ? new Date(modal.openedAt) : ctx.now;
  const type = draft.planType || existing.type || modal.planType || 'meeting';
  const contactId = draft.contact ?? existing.contactId ?? modal.preset?.contactId ?? '';
  const dealId = draft.deal ?? existing.dealId ?? modal.preset?.dealId ?? '';
  const date = draft.date || (existing.date ? localDateTime(existing.date) : localDateTime(modal.preset?.date || defaultPlanDate(openedAt)));
  const types = PLAN_TYPES.map((id) => `
    <label class="type-option" style="--tone:${ACTIVITY_COLOR[id]}">
      <input type="radio" name="planType" value="${id}" data-plan-type ${type === id ? 'checked' : ''}>
      <span>${icon(id, 16)}${esc(ACTIVITY_LABEL[id])}</span>
    </label>`).join('');
  const body = `
    <div class="form-grid" style="--tone:${ACTIVITY_COLOR[type]}">
      ${field('What’s next?', `<input data-field="title" value="${esc(draft.title ?? existing.title ?? modal.preset?.title ?? '')}" placeholder="e.g. Present GTM deck" autocomplete="off">`, { required: true, wide: true })}
      <div class="suggestions wide" aria-label="Suggestions">${TITLE_IDEAS.map((idea) => `<button type="button" class="suggestion" data-action="pick-title" data-title="${esc(idea)}">${esc(idea)}</button>`).join('')}</div>
      <div class="field wide"><span>Type</span><div class="type-picker" role="radiogroup" aria-label="Type">${types}</div></div>
      ${field('When', `<input data-field="date" type="datetime-local" value="${esc(date)}">`, { required: true, wide: true })}
      <div class="suggestions wide" aria-label="Quick dates">${WHEN_PRESETS.map(([id, label]) => `<button type="button" class="suggestion" data-action="pick-when" data-when="${id}">${icon('calendar', 12)}${esc(label)}</button>`).join('')}</div>
      ${field('With', contactPicker(ctx.contacts, contactId, 'contact', ctx.companies), { required: true, wide: true })}
      ${field('Deal', dealSelect(ctx.deals, ctx.contacts, ctx.companies, contactId, dealId), { wide: true })}
      ${field('Notes', `<textarea data-field="description" rows="2" placeholder="Agenda, who else is joining, what to prepare…">${esc(draft.description ?? existing.description ?? '')}</textarea>`, { wide: true })}
    </div>`;
  const actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button>
    ${modal.id ? `<button type="button" class="btn ghost" data-action="step-done" data-id="${esc(modal.id)}">${icon('check', 15)}Mark done</button>` : ''}
    <button type="button" class="btn primary" data-action="save-modal">${icon('flag', 15)}${modal.id ? 'Save' : 'Plan it'}</button>`;
  return modalFrame({ type: 'plan', title: modal.id ? 'Edit next step' : 'Plan next step', iconName: 'flag', body, actions, variant: 'sheet', tone: ACTIVITY_COLOR[type] });
}

/* ───────────── Mark done ───────────── */

function renderComplete(ctx) {
  const modal = ctx.ui.modal;
  const draft = draftOf(modal);
  const step = ctx.activities.find((item) => item.id === modal.id);
  if (!step) return '';
  const openedAt = modal.openedAt ? new Date(modal.openedAt) : ctx.now;
  const contact = contactById(ctx.contacts, step.contactId);
  const happened = new Date(step.date) < openedAt ? new Date(step.date) : openedAt;
  const body = `
    <div class="step-summary" style="--tone:${ACTIVITY_COLOR[step.type] || ACTIVITY_COLOR.task}">
      <span class="type-chip">${icon(step.type, 16)}</span>
      <div><strong>${esc(step.title)}</strong><span class="muted small">${esc(dueLabel(step.date, openedAt))}${contact ? ` · ${esc(contact.name)}` : ''}</span></div>
    </div>
    <div class="form-grid">
      ${field('How did it go?', `<input data-field="outcome" value="${esc(draft.outcome ?? step.outcome ?? '')}" placeholder="e.g. Deck landed well, legal review next" autocomplete="off">`, { wide: true })}
      ${field('When did it happen?', `<input data-field="date" type="datetime-local" value="${esc(draft.date || localDateTime(happened))}">`, { required: true })}
      ${step.type === 'call' || step.type === 'meeting' ? field('Duration (minutes)', `<input data-field="duration" type="number" min="0" value="${esc(draft.duration ?? step.duration ?? '')}">`) : '<span></span>'}
      ${field('Notes', `<textarea data-field="description" rows="3">${esc(draft.description ?? step.description ?? '')}</textarea>`, { wide: true })}
      <label class="check-row wide"><input type="checkbox" data-field="planNext" ${draft.planNext === false ? '' : 'checked'}><span>${icon('flag', 14)}Plan the next step right after</span></label>
    </div>`;
  const actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button><button type="button" class="btn emerald" data-action="save-modal">${icon('check', 15)}Mark done</button>`;
  return modalFrame({ type: 'complete', title: 'Mark as done', iconName: 'check', body, actions, variant: 'sheet' });
}

/* ───────────── Message composer ───────────── */

export function composerContext(ctx) {
  const modal = ctx.ui.modal;
  const contact = contactById(ctx.contacts, modal.contactId);
  const deal = ctx.deals.find((item) => item.id === modal.dealId) ?? null;
  const company = companyById(ctx.companies, modal.companyId) || companyOf(contact, ctx.companies);
  const nextStep = (deal && nextStepForDeal(deal, ctx.activities)) || (contact && nextStepForContact(contact.id, ctx.activities)) || null;
  const vars = templateVars({ contact, company, deal, nextStep, settings: ctx.settings });
  return { contact, deal, company, nextStep, vars };
}

function renderMessage(ctx) {
  const modal = ctx.ui.modal;
  const { contact, deal, vars } = composerContext(ctx);
  const people = candidatePeople(modal, ctx);
  const templates = templatesFrom(ctx.settings);
  const text = modal.text ?? '';
  const resolved = renderTemplate(text, vars);
  const code = ctx.settings.countryCode;
  const canWhatsApp = contact && hasDialableNumber(contact.phone, code);
  const recipients = people.length > 1 || (people.length === 1 && !contact)
    ? `<div class="recipients" role="group" aria-label="Send to">${people.map(({ contact: person, note }) => personChip(person, note, person.id === contact?.id)).join('')}</div>`
    : '';
  const picker = !people.length
    ? field('To', contactPicker(ctx.contacts, modal.contactId || '', 'contact', ctx.companies), { required: true, wide: true })
    : '';
  const body = `
    ${contact ? `<div class="compose-to">${avatar(contact.name, 'sm')}<span><strong>${esc(contact.name)}</strong><small class="muted">${esc([contact.phone || 'No phone number', companyName(contact, ctx.companies)].filter(Boolean).join(' · '))}</small></span>${deal ? `<span class="deal-ref">${icon('link', 12)}${esc(deal.title)}</span>` : ''}</div>` : ''}
    ${recipients}${picker}
    <div class="template-chips" role="group" aria-label="Templates">${templates.map((template) => `<button type="button" class="suggestion ${modal.templateId === template.id ? 'is-on' : ''}" data-action="pick-template" data-template-id="${esc(template.id)}" aria-pressed="${modal.templateId === template.id ? 'true' : 'false'}">${esc(template.name)}</button>`).join('')}</div>
    <label class="field wide"><span>Message</span><textarea data-field="message" rows="5" placeholder="Write your message…">${esc(text)}</textarea></label>
    <div class="bubble-preview" data-preview ${resolved ? '' : 'hidden'}><span class="bubble" data-preview-text>${esc(resolved)}</span><span class="bubble-meta">Preview</span></div>
    <div class="compose-meta"><span data-char-count>${resolved.length} characters</span>${contact ? `<span>Opens WhatsApp with ${esc(contact.name.split(' ')[0])} selected. Tap send there; a copy is saved to the Chronicle.</span>` : ''}</div>
    ${contact && !canWhatsApp ? `<div class="inline-warning">${icon('warning', 16)}<span>${esc(contact.name)} has no phone number yet.</span><button type="button" class="text-link" data-action="edit-contact" data-id="${esc(contact.id)}">Add phone number</button></div>` : ''}`;
  const disabled = !resolved || !contact;
  const off = disabled ? 'aria-disabled="true"' : 'aria-disabled="false"';
  const wa = canWhatsApp
    ? `<a class="btn whatsapp" data-action="send-whatsapp" href="${esc(waLink(contact.phone, resolved, code))}" target="_blank" rel="noopener" ${off}>${icon('whatsapp', 16)}Send on WhatsApp</a>`
    : `<button type="button" class="btn whatsapp" data-action="send-whatsapp" disabled>${icon('whatsapp', 16)}Send on WhatsApp</button>`;
  const email = contact?.email
    ? `<a class="btn ghost" data-action="send-email" href="${esc(mailtoLink(contact.email, deal?.title || 'Following up', resolved))}" ${off}>${icon('email', 15)}Email</a>`
    : '';
  const actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button>
    <button type="button" class="btn ghost" data-action="copy-message" ${disabled ? 'disabled' : ''}>${icon('copy', 15)}Copy</button>
    ${email}${wa}`;
  return modalFrame({ type: 'message', title: 'Message', iconName: 'whatsapp', body, actions, variant: 'sheet', tone: ACTIVITY_COLOR.whatsapp });
}

/* ───────────── Call options ───────────── */

function renderCall(ctx) {
  const modal = ctx.ui.modal;
  const contact = contactById(ctx.contacts, modal.contactId);
  const people = candidatePeople(modal, ctx);
  const code = ctx.settings.countryCode;
  let body;
  if (!contact) {
    body = people.length
      ? `<p class="muted sheet-lead">Who are you calling?</p><div class="person-picker">${people.map(({ contact: person, note }) => `
          <button type="button" class="call-person" data-action="pick-recipient" data-contact-ref="${esc(person.id)}" ${person.phone ? '' : 'data-no-phone="true"'}>
            ${avatar(person.name)}<span><strong>${esc(person.name)}</strong><small>${esc(note || companyName(person, ctx.companies))}</small></span><span class="call-person-number">${esc(person.phone || 'No number')}</span>
          </button>`).join('')}</div>`
      : field('Who are you calling?', contactPicker(ctx.contacts, '', 'contact', ctx.companies), { wide: true });
  } else {
    const dialable = hasDialableNumber(contact.phone, code);
    const first = contact.name.split(' ')[0];
    body = `
      <div class="call-hero">
        ${avatar(contact.name, 'lg')}
        <div><strong>${esc(contact.name)}</strong><span class="muted">${esc([contact.title, companyName(contact, ctx.companies)].filter(Boolean).join(' · '))}</span>
        <span class="call-number">${esc(contact.phone || 'No phone number saved')}</span></div>
        ${people.length > 1 ? `<button type="button" class="text-link" data-action="call-change">Change</button>` : ''}
      </div>
      ${dialable ? `<div class="call-options">
        <a class="call-option" href="${esc(telLink(contact.phone, code))}" data-action="call-via" data-channel="phone">
          <span class="call-option-icon">${icon('call', 20)}</span><span><strong>Phone call</strong><small>Rings ${esc(first)} from your phone’s dialler</small></span>${icon('chevron', 16)}
        </a>
        <a class="call-option whatsapp" href="${esc(waLink(contact.phone, '', code))}" target="_blank" rel="noopener" data-action="call-via" data-channel="whatsapp">
          <span class="call-option-icon">${icon('whatsapp', 20)}</span><span><strong>WhatsApp call</strong><small>Opens your chat with ${esc(first)}; tap the call icon to ring</small></span>${icon('chevron', 16)}
        </a>
        <button type="button" class="call-option subtle" data-action="copy-number" data-contact-ref="${esc(contact.id)}">
          <span class="call-option-icon">${icon('copy', 18)}</span><span><strong>Copy number</strong><small>${esc(contact.phone)}</small></span>
        </button>
      </div>` : `<div class="inline-warning">${icon('warning', 16)}<span>Add a phone number to call ${esc(first)}.</span><button type="button" class="text-link" data-action="edit-contact" data-id="${esc(contact.id)}">Add phone number</button></div>`}
      <button type="button" class="call-option subtle log-past" data-action="log-past-call">
        <span class="call-option-icon">${icon('note', 18)}</span><span><strong>Log a call you already made</strong><small>Adds it to the Chronicle</small></span>
      </button>`;
  }
  return modalFrame({ type: 'call', title: contact ? `Call ${contact.name.split(' ')[0]}` : 'Call', iconName: 'call', body, actions: '', variant: 'sheet compact', tone: ACTIVITY_COLOR.call });
}

/* ───────────── Voice note ───────────── */

function renderVoice(ctx) {
  const modal = ctx.ui.modal;
  const draft = draftOf(modal);
  const recording = modal.phase === 'recording';
  if (recording) {
    const paused = modal.state === 'paused';
    const body = `
      <div class="voice-stage" data-voice-state="${paused ? 'paused' : 'listening'}">
        <button type="button" class="voice-orb" data-action="voice-toggle" aria-label="${paused ? 'Resume recording' : 'Pause recording'}">
          <span class="voice-ring"></span><span class="voice-ring delay"></span>${icon(paused ? 'mic' : 'mic', 34)}
        </button>
        <div class="voice-timer" data-voice-timer>${esc(formatClock(modal.elapsed || 0))}</div>
        <p class="voice-status" data-voice-status>${paused ? 'Paused — tap the mic to carry on' : 'Listening… speak naturally'}</p>
        <div class="voice-transcript" data-voice-transcript aria-live="polite">${modal.transcript || modal.interim
          ? `<span class="final">${esc(modal.transcript || '')}</span> <span class="interim">${esc(modal.interim || '')}</span>`
          : '<span class="placeholder">Your words appear here as you speak.</span>'}</div>
        ${modal.error ? `<div class="inline-warning">${icon('warning', 16)}<span>${esc(modal.error)}</span></div>` : ''}
      </div>`;
    const actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Cancel</button>
      <button type="button" class="btn ghost" data-action="voice-toggle">${icon(paused ? 'mic' : 'pause', 15)}${paused ? 'Resume' : 'Pause'}</button>
      <button type="button" class="btn primary" data-action="voice-stop">${icon('stop', 15)}Done</button>`;
    return modalFrame({ type: 'voice', title: 'Voice note', iconName: 'mic', body, actions, variant: 'sheet voice' });
  }

  const contactId = draft.contact ?? modal.preset?.contactId ?? '';
  const dealId = draft.deal ?? modal.preset?.dealId ?? '';
  const text = draft.description ?? modal.transcript ?? '';
  const recents = recentContacts(ctx).filter((contact) => contact.id !== contactId);
  const startedAt = modal.startedAt ? new Date(modal.startedAt) : ctx.now;
  const body = `
    ${modal.supported === false ? `<div class="inline-tip">${icon('mic', 16)}<span>Voice typing isn’t available in this browser. Tap the <strong>microphone on your keyboard</strong> to dictate, or type your note.</span></div>` : ''}
    ${modal.error && modal.supported !== false ? `<div class="inline-warning">${icon('warning', 16)}<span>${esc(modal.error)}</span></div>` : ''}
    <div class="form-grid">
      ${field('Note', `<textarea data-field="description" rows="6" placeholder="What happened, what was agreed, what’s next…">${esc(text)}</textarea>`, { required: true, wide: true })}
      ${field('Title', `<input data-field="title" value="${esc(draft.title ?? suggestTitle(text))}" autocomplete="off">`, { wide: true })}
      ${recents.length ? `<div class="suggestions wide" aria-label="Recent contacts">${recents.map((contact) => `<button type="button" class="suggestion" data-action="pick-contact" data-contact-ref="${esc(contact.id)}">${avatar(contact.name, 'xs')}${esc(contact.name)}</button>`).join('')}</div>` : ''}
      ${field('About', contactPicker(ctx.contacts, contactId, 'contact', ctx.companies), { required: true, wide: true })}
      ${field('Deal', dealSelect(ctx.deals, ctx.contacts, ctx.companies, contactId, dealId), { wide: true })}
      <label class="check-row wide"><input type="checkbox" data-field="planNext" ${draft.planNext ? 'checked' : ''}><span>${icon('flag', 14)}Also plan a next step</span></label>
    </div>
    <p class="muted small voice-meta">${icon('clock', 12)} Recorded ${esc(shortDate(startedAt))}, ${esc(clockTime(startedAt))}${modal.elapsed ? ` · ${esc(formatClock(modal.elapsed))}` : ''}</p>`;
  const actions = `<button type="button" class="btn ghost" data-action="cancel-modal">Discard</button>
    ${modal.supported === false ? '' : `<button type="button" class="btn ghost" data-action="voice-resume">${icon('mic', 15)}Record more</button>`}
    <button type="button" class="btn primary" data-action="save-modal">${icon('check', 15)}Save note</button>`;
  return modalFrame({ type: 'voice', title: modal.supported === false ? 'Quick note' : 'Review voice note', iconName: 'mic', body, actions, variant: 'sheet voice' });
}

export function renderSheet(ctx) {
  const type = ctx.ui.modal?.type;
  if (!SHEET_TYPES.includes(type)) return '';
  if (type === 'plan') return renderPlan(ctx);
  if (type === 'complete') return renderComplete(ctx);
  if (type === 'message') return renderMessage(ctx);
  if (type === 'call') return renderCall(ctx);
  return renderVoice(ctx);
}
