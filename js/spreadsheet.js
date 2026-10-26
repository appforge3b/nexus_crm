import { STAGES, STAGE_PROBABILITY } from './stages.js';
import { STAKEHOLDER_ROLES } from './companies.js';
import { companyKey } from './migrate.js';
import { stageLabel } from './settings.js';
import { validateActivity, validateCompany, validateContact, validateDeal, validateOrder, validateTag } from './validation.js';

const CONTACT_STATUSES = ['prospect', 'active', 'customer', 'inactive'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'task', 'whatsapp'];
const ACTIVITY_STATUSES = ['planned', 'done'];
const ORDER_STATUSES = ['completed', 'pending', 'cancelled'];
const TAG_PALETTE = ['#6366f1', '#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SHEET_COLLECTIONS = {
  Companies: 'companies',
  Contacts: 'contacts',
  Deals: 'deals',
  Activities: 'activities',
  Customers: 'customers',
  Orders: 'orders',
  Tags: 'tags',
};

const label = (value) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : '');
const ID_PROMPT = 'Filled in by NEXUS. Leave blank for new rows; keep it to update an existing record.';

function sheetSpecs(settings) {
  const stageNames = STAGES.map((id) => stageLabel(settings, id));
  const id = { key: 'id', header: 'ID', kind: 'id', width: 22, prompt: ID_PROMPT };
  return [
    {
      name: 'Companies',
      purpose: 'Organisations you sell to. Contacts link to a company by its name.',
      columns: [
        id,
        { key: 'name', header: 'Name', required: true, width: 28, prompt: 'Company name. Must be unique.' },
        { key: 'website', header: 'Website', width: 26 },
        { key: 'industry', header: 'Industry', width: 18 },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
    },
    {
      name: 'Contacts',
      purpose: 'People. Email is the best way to keep them unique.',
      columns: [
        id,
        { key: 'name', header: 'Name', required: true, width: 24 },
        { key: 'email', header: 'Email', width: 30, prompt: 'Used to find this person again when a row has no ID.' },
        { key: 'phone', header: 'Phone', width: 18, prompt: 'Include the country code, e.g. +91 98450 12873.' },
        { key: 'company', header: 'Company', width: 24, listRef: "'Companies'!$B$2:$B$10000", prompt: 'Company name. A new company is created if it does not exist yet.' },
        { key: 'title', header: 'Job title', aliases: ['title', 'designation', 'role'], width: 22 },
        { key: 'status', header: 'Status', kind: 'enum', values: CONTACT_STATUSES, list: CONTACT_STATUSES.map(label), width: 12, prompt: 'Prospect, Active, Customer or Inactive. Blank means Prospect.' },
        { key: 'source', header: 'Source', width: 14, prompt: 'Where they came from, e.g. Referral, Conference, Inbound.' },
        { key: 'tags', header: 'Tags', width: 24, prompt: 'Comma-separated tag names. New tags are created.' },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
    },
    {
      name: 'Deals',
      purpose: 'Opportunities in the pipeline. Each deal has one primary contact.',
      columns: [
        id,
        { key: 'title', header: 'Title', required: true, width: 30 },
        { key: 'contact', header: 'Primary contact', aliases: ['contact', 'contact email'], required: true, width: 28, listRef: "'Contacts'!$B$2:$B$10000", prompt: "The contact's email, name or ID." },
        { key: 'value', header: 'Value', kind: 'number', required: true, width: 14, prompt: 'Deal value in your currency. 420000, 4.2L and 1.5Cr all work.' },
        { key: 'stage', header: 'Stage', kind: 'enum', values: STAGES, list: stageNames, width: 14, prompt: `${stageNames.join(', ')}. Blank means ${stageNames[0]}.` },
        { key: 'priority', header: 'Priority', kind: 'enum', values: PRIORITIES, list: PRIORITIES.map(label), width: 11, prompt: 'Critical, High, Medium or Low. Blank means Medium.' },
        { key: 'probability', header: 'Probability %', aliases: ['probability'], kind: 'number', width: 13, prompt: '0 to 100. Blank uses the usual probability for the stage.' },
        { key: 'expectedCloseDate', header: 'Expected close', aliases: ['close date', 'expected close date'], kind: 'date', width: 15, prompt: 'A date, e.g. 2026-12-31 or 31/12/2026.' },
        { key: 'lostReason', header: 'Lost reason', width: 16, prompt: 'Required when the stage is Lost.' },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
    },
    {
      name: 'Deal people',
      purpose: 'Everyone involved in a deal besides (or including) the primary contact. Listing a deal here replaces its people.',
      columns: [
        { key: 'deal', header: 'Deal', required: true, width: 30, listRef: "'Deals'!$B$2:$B$10000", prompt: 'Deal title or ID.' },
        { key: 'contact', header: 'Contact', required: true, width: 28, listRef: "'Contacts'!$B$2:$B$10000", prompt: "The contact's email, name or ID." },
        { key: 'role', header: 'Role', kind: 'enum', values: STAKEHOLDER_ROLES, list: STAKEHOLDER_ROLES, width: 16 },
      ],
    },
    {
      name: 'Activities',
      purpose: 'The Chronicle: calls, emails, meetings, notes and planned next steps.',
      columns: [
        id,
        { key: 'type', header: 'Type', kind: 'enum', values: ACTIVITY_TYPES, list: ACTIVITY_TYPES.map((type) => (type === 'whatsapp' ? 'WhatsApp' : label(type))), required: true, width: 12 },
        { key: 'status', header: 'Status', kind: 'enum', values: ACTIVITY_STATUSES, list: ['Planned', 'Done'], width: 10, prompt: 'Planned or Done. Blank means Planned for future dates and Done otherwise.' },
        { key: 'date', header: 'Date & time', aliases: ['date', 'when'], kind: 'datetime', required: true, width: 18, prompt: 'e.g. 2026-10-21 14:30 or 21/10/2026 14:30.' },
        { key: 'contact', header: 'Contact', required: true, width: 28, listRef: "'Contacts'!$B$2:$B$10000", prompt: "The contact's email, name or ID." },
        { key: 'deal', header: 'Deal', width: 28, listRef: "'Deals'!$B$2:$B$10000", prompt: 'Optional. Deal title or ID; the contact must be on that deal.' },
        { key: 'title', header: 'Title', required: true, width: 30 },
        { key: 'description', header: 'Description', width: 44 },
        { key: 'duration', header: 'Duration (min)', aliases: ['duration'], kind: 'number', width: 13 },
        { key: 'outcome', header: 'Outcome', width: 24 },
      ],
    },
    {
      name: 'Customers',
      purpose: 'Accounts in Customer HQ. One per company (or per contact without a company).',
      columns: [
        id,
        { key: 'contact', header: 'Contact', required: true, width: 28, listRef: "'Contacts'!$B$2:$B$10000", prompt: "The main contact's email, name or ID." },
        { key: 'deal', header: 'Won deal', aliases: ['deal'], width: 28, listRef: "'Deals'!$B$2:$B$10000", prompt: 'Optional. The deal that made them a customer.' },
        { key: 'convertedAt', header: 'Customer since', kind: 'date', width: 15 },
        { key: 'rating', header: 'Rating', kind: 'number', width: 9, list: ['1', '2', '3', '4', '5'], prompt: 'Satisfaction from 1 to 5. Optional.' },
        { key: 'notes', header: 'Notes', width: 44 },
      ],
    },
    {
      name: 'Orders',
      purpose: 'What each customer has bought.',
      columns: [
        id,
        { key: 'customer', header: 'Customer', required: true, width: 28, prompt: "The customer's contact email, contact name, company name or customer ID." },
        { key: 'description', header: 'Description', required: true, width: 32 },
        { key: 'amount', header: 'Amount', kind: 'number', required: true, width: 14 },
        { key: 'date', header: 'Date', kind: 'date', required: true, width: 13 },
        { key: 'status', header: 'Status', kind: 'enum', values: ORDER_STATUSES, list: ORDER_STATUSES.map(label), width: 12, prompt: 'Completed, Pending or Cancelled. Blank means Completed.' },
        { key: 'notes', header: 'Notes', width: 32 },
      ],
    },
    {
      name: 'Tags',
      purpose: 'Labels for contacts. Tags typed on the Contacts sheet are created automatically.',
      columns: [
        id,
        { key: 'name', header: 'Name', required: true, width: 22 },
        { key: 'color', header: 'Color', width: 12, prompt: 'Hex colour such as #6366f1. Optional.' },
      ],
    },
  ];
}

function columnsForWorkbook(spec) {
  return spec.columns.map((column) => ({
    ...column,
    header: column.required ? `${column.header} *` : column.header,
    kind: column.kind === 'enum' ? 'text' : column.kind || 'text',
  }));
}

/* ───────────── export ───────────── */

function uniqueBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return (item) => {
    const key = keyOf(item);
    return Boolean(key) && counts.get(key) === 1;
  };
}

function referencers(state) {
  const emailUnique = uniqueBy(state.contacts, (c) => String(c.email || '').trim().toLowerCase());
  const nameUnique = uniqueBy(state.contacts, (c) => String(c.name || '').trim().toLowerCase());
  const titleUnique = uniqueBy(state.deals, (d) => String(d.title || '').trim().toLowerCase());
  const contacts = new Map(state.contacts.map((c) => [c.id, c]));
  const deals = new Map(state.deals.map((d) => [d.id, d]));
  const contactRef = (id) => {
    const contact = contacts.get(id);
    if (!contact) return id || '';
    if (emailUnique(contact)) return contact.email.trim();
    if (nameUnique(contact)) return contact.name.trim();
    return contact.id;
  };
  const dealRef = (id) => {
    const deal = deals.get(id);
    if (!deal) return id || '';
    return titleUnique(deal) ? deal.title.trim() : deal.id;
  };
  const customerRef = (customer) => contactRef(customer.contactId) || customer.id;
  return { contactRef, dealRef, customerRef, contacts };
}

function dateOnly(value) {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : value;
}

function exportRows(spec, state, settings, refs) {
  const tagNames = new Map(state.tags.map((tag) => [tag.id, tag.name]));
  const companies = new Map(state.companies.map((company) => [company.id, company]));
  const customers = new Map(state.customers.map((customer) => [customer.id, customer]));
  const rows = {
    Companies: () => state.companies.map((c) => [c.id, c.name, c.website, c.industry, c.notes]),
    Contacts: () => state.contacts.map((c) => [
      c.id, c.name, c.email, c.phone, companies.get(c.companyId)?.name ?? c.company ?? '', c.title,
      label(c.status), c.source, (c.tags || []).map((id) => tagNames.get(id)).filter(Boolean).join(', '), c.notes,
    ]),
    Deals: () => state.deals.map((d) => [
      d.id, d.title, refs.contactRef(d.contactId), Number(d.value) || 0, stageLabel(settings, d.stage), label(d.priority),
      d.probability ?? '', dateOnly(d.expectedCloseDate), d.lostReason, d.notes,
    ]),
    'Deal people': () => state.deals.flatMap((d) => (d.stakeholders || []).map((s) => [refs.dealRef(d.id), refs.contactRef(s.contactId), s.role || ''])),
    Activities: () => state.activities.map((a) => [
      a.id, a.type === 'whatsapp' ? 'WhatsApp' : label(a.type), label(a.status), a.date, refs.contactRef(a.contactId),
      a.dealId ? refs.dealRef(a.dealId) : '', a.title, a.description, a.duration ?? '', a.outcome,
    ]),
    Customers: () => state.customers.map((c) => [
      c.id, refs.contactRef(c.contactId), c.convertedDealId ? refs.dealRef(c.convertedDealId) : '', dateOnly(c.convertedAt),
      c.satisfactionRating ?? '', c.notes,
    ]),
    Orders: () => state.orders.map((o) => [
      o.id, customers.has(o.customerId) ? refs.customerRef(customers.get(o.customerId)) : o.customerId, o.description,
      Number(o.amount) || 0, dateOnly(o.date), label(o.status), o.notes,
    ]),
    Tags: () => state.tags.map((t) => [t.id, t.name, t.color]),
  };
  return rows[spec.name]();
}

function instructions(specs, { blank, workspace, now }) {
  const rows = [
    [{ v: 'NEXUS import workbook', s: 'title' }],
    [{ v: blank ? `Blank template${workspace ? ` for ${workspace}` : ''}` : `Records from ${workspace || 'NEXUS'}, exported ${now.toISOString().slice(0, 10)}`, s: 'muted' }],
    [],
    [{ v: 'How it works', s: 'heading' }],
    ['1.', '', 'Fill in one sheet per kind of record. You only need the sheets you use; delete or leave the others empty.'],
    ['2.', '', 'Columns marked * are required. Click a cell under a header to see a hint, and use the dropdowns where there are fixed choices.'],
    ['3.', '', 'Refer to other records by a readable value: a contact by email or name, a company or deal by its name or title. New companies and tags are created for you.'],
    ['4.', '', 'Leave the ID column blank for new rows. Rows with an ID update that record, so the easiest way to make bulk changes is to export with your records, edit, and import the same file.'],
    ['5.', '', 'Rows without an ID update a matching record when there is one: a contact with the same email, a company with the same name, a deal with the same title and primary contact.'],
    ['6.', '', 'When you update a record, every column in the sheet is applied, including blank cells. Remove a column entirely to leave that field as it is.'],
    ['7.', '', 'In NEXUS, go to Settings ➔ Data Management ➔ Import from Excel. You will see what will be created and updated, and any rows with problems, before anything is saved. Nothing is ever deleted.'],
    [],
  ];
  for (const spec of specs) {
    rows.push([{ v: spec.name, s: 'heading' }, '', { v: spec.purpose, s: 'muted' }]);
    rows.push([{ v: 'Column', s: 'header' }, { v: 'Required', s: 'header' }, { v: 'What to enter', s: 'header' }]);
    for (const column of spec.columns) {
      const values = column.list && column.kind === 'enum' ? `One of: ${column.list.join(', ')}.` : '';
      rows.push([column.header, column.required ? 'Yes' : '', [column.prompt, values].filter(Boolean).join(' ')]);
    }
    rows.push([]);
  }
  return { name: 'Instructions', notes: true, widths: [26, 11, 100], rows };
}

/** The workbook as sheet descriptions for writeXlsx: instructions, then one sheet per kind of record. */
export function workbookSheets(state, { settings, blank = false, workspace = '', now = new Date() } = {}) {
  const specs = sheetSpecs(settings || state.settings);
  const refs = blank ? null : referencers(state);
  return [
    instructions(specs, { blank, workspace, now }),
    ...specs.map((spec) => ({
      name: spec.name,
      columns: columnsForWorkbook(spec),
      rows: blank ? [] : exportRows(spec, state, settings || state.settings, refs),
    })),
  ];
}

/* ───────────── import ───────────── */

const norm = (value) => String(value ?? '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();

function text(value) {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value).trim();
}

const MULTIPLIERS = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, m: 1e6, mn: 1e6 };

export function parseAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = String(value).trim().toLowerCase().replace(/[₹$€£¥,\s]|rs\.?|inr/g, '');
  if (!raw) return null;
  const match = /^(-?\d*\.?\d+)([a-z]*)$/.exec(raw);
  if (!match) return NaN;
  const multiplier = match[2] ? MULTIPLIERS[match[2]] : 1;
  return multiplier ? Number(match[1]) * multiplier : NaN;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Excel dates, ISO dates, and day-first dates (21/10/2026, 21-10-2026 14:30) as used in India. */
export function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value;
  if (typeof value === 'number') return NaN;
  const raw = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (match && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
  }
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i.exec(raw);
  if (match) {
    let hour = Number(match[4] || 0);
    if (match[6]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (match[6]?.toLowerCase() === 'am' && hour === 12) hour = 0;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), hour, Number(match[5] || 0));
    return date.getMonth() === Number(match[2]) - 1 ? date : NaN;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? NaN : parsed;
}

function same(a, b) {
  const strip = (record) => {
    const { updatedAt, ...rest } = record;
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  return strip(a) === strip(b);
}

class RowError extends Error {}

/**
 * Works out what importing a workbook would change, without changing anything.
 * Returns { ops, counts, problems, warnings, rows } where ops are { op: 'upsert', collection, id, data }.
 */
export function planSpreadsheetImport(workbook, state, { now = new Date(), newId = () => crypto.randomUUID(), settings } = {}) {
  const specs = sheetSpecs(settings || state.settings);
  const stamp = now.toISOString();
  const problems = [];
  const warnings = [];
  const counts = {};
  let rows = 0;

  const draft = {};
  for (const collection of Object.values(SHEET_COLLECTIONS)) {
    draft[collection] = new Map((state[collection] || []).map((item) => [item.id, item]));
    counts[collection] = { created: 0, updated: 0, unchanged: 0 };
  }
  const original = new Map();
  for (const collection of Object.values(SHEET_COLLECTIONS)) {
    for (const item of state[collection] || []) original.set(`${collection}/${item.id}`, item);
  }
  const touched = new Map();
  let journal = null;

  function put(collection, record) {
    const key = `${collection}/${record.id}`;
    journal?.push({ collection, id: record.id, previous: draft[collection].get(record.id), wasTouched: touched.has(key) });
    draft[collection].set(record.id, record);
    touched.set(key, { collection, id: record.id });
  }

  /** Undoes everything a failed row did, including companies and tags it created along the way. */
  function rollback(entries) {
    for (const entry of entries.reverse()) {
      if (entry.previous) draft[entry.collection].set(entry.id, entry.previous);
      else draft[entry.collection].delete(entry.id);
      if (!entry.wasTouched) touched.delete(`${entry.collection}/${entry.id}`);
    }
  }

  const isNew = (collection, row) => !draft[collection].has(text(row.id));

  const list = (collection) => [...draft[collection].values()];
  const lower = (value) => String(value ?? '').trim().toLowerCase();

  function findContact(value, { required = true, what = 'contact' } = {}) {
    const raw = text(value);
    if (!raw) {
      if (required) throw new RowError(`Add the ${what}`);
      return null;
    }
    if (draft.contacts.has(raw)) return draft.contacts.get(raw);
    const key = raw.toLowerCase();
    const byEmail = list('contacts').filter((c) => lower(c.email) === key);
    if (byEmail.length === 1) return byEmail[0];
    const byName = list('contacts').filter((c) => lower(c.name) === key);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1 || byEmail.length > 1) throw new RowError(`More than one contact matches "${raw}". Use their email or ID`);
    throw new RowError(`No contact matches "${raw}". Add them on the Contacts sheet first`);
  }

  function findDeal(value, { required = false } = {}) {
    const raw = text(value);
    if (!raw) {
      if (required) throw new RowError('Add the deal');
      return null;
    }
    if (draft.deals.has(raw)) return draft.deals.get(raw);
    const matches = list('deals').filter((d) => lower(d.title) === raw.toLowerCase());
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new RowError(`More than one deal is called "${raw}". Use the deal ID`);
    throw new RowError(`No deal matches "${raw}"`);
  }

  function findOrCreateCompany(value) {
    const raw = text(value).replace(/\s+/g, ' ');
    if (!raw) return null;
    if (draft.companies.has(raw)) return draft.companies.get(raw);
    const found = list('companies').find((c) => companyKey(c.name) === companyKey(raw));
    if (found) return found;
    const company = { id: newId(), name: raw, website: '', industry: '', notes: '', createdAt: stamp, updatedAt: stamp };
    put('companies', company);
    return company;
  }

  function findOrCreateTags(value) {
    const names = text(value).split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    const ids = [];
    for (const name of names) {
      let tag = draft.tags.get(name) || list('tags').find((t) => lower(t.name) === name.toLowerCase());
      if (!tag) {
        tag = { id: newId(), name, color: TAG_PALETTE[draft.tags.size % TAG_PALETTE.length], createdAt: stamp, updatedAt: stamp };
        put('tags', tag);
      }
      if (!ids.includes(tag.id)) ids.push(tag.id);
    }
    return ids;
  }

  function enumValue(column, value, fallback) {
    const raw = lower(text(value));
    if (!raw) return fallback;
    const index = column.values.findIndex((option, i) => option.toLowerCase() === raw || lower(column.list?.[i]) === raw);
    if (index < 0) throw new RowError(`${column.header} must be one of ${column.list.join(', ')}`);
    return column.values[index];
  }

  function numberValue(column, value, { min = 0, max = Infinity } = {}) {
    const amount = parseAmount(value);
    if (amount == null) return null;
    if (Number.isNaN(amount)) throw new RowError(`${column.header} must be a number`);
    if (amount < min || amount > max) throw new RowError(max === Infinity ? `${column.header} must be ${min} or more` : `${column.header} must be between ${min} and ${max}`);
    return amount;
  }

  function dateValue(column, value) {
    const date = parseDate(value);
    if (date == null) return null;
    if (Number.isNaN(date)) throw new RowError(`${column.header} is not a date we recognise. Use 2026-10-21 or 21/10/2026`);
    return date;
  }

  function firstError(result) {
    if (!result.ok) throw new RowError(result.errors[0].message);
  }

  /** Picks the record a row is about: by ID, then by the sheet's natural key. */
  function target(collection, row, seen, fallback) {
    const id = text(row.id);
    if (id && id.length > 100) throw new RowError('ID is too long');
    const existing = id ? draft[collection].get(id) ?? null : fallback();
    const key = existing?.id || id;
    if (key && seen.has(key)) throw new RowError(`This is the same record as row ${seen.get(key)}`);
    return { id: existing?.id || id || newId(), existing };
  }

  function stamped(existing, data) {
    return existing
      ? { ...existing, ...data, id: existing.id, createdAt: existing.createdAt, updatedAt: stamp }
      : { ...data, createdAt: stamp, updatedAt: stamp };
  }

  const handlers = {
    Tags(row, has, spec, seen) {
      const name = text(row.name);
      const { id, existing } = target('tags', row, seen, () => list('tags').find((t) => lower(t.name) === lower(name)) ?? null);
      const next = stamped(existing, { id, name: has.name ? name : existing?.name ?? name });
      if (has.color || !existing) {
        const color = text(row.color);
        if (color && !HEX.test(color)) throw new RowError('Color must be a hex code such as #6366f1');
        next.color = color || existing?.color || TAG_PALETTE[draft.tags.size % TAG_PALETTE.length];
      }
      firstError(validateTag(next, { tags: list('tags').filter((t) => t.id !== id) }));
      return ['tags', next, existing];
    },

    Companies(row, has, spec, seen) {
      const name = text(row.name).replace(/\s+/g, ' ');
      const { id, existing } = target('companies', row, seen, () => list('companies').find((c) => companyKey(c.name) === companyKey(name)) ?? null);
      const data = { id };
      for (const key of ['name', 'website', 'industry', 'notes']) if (has[key] || !existing) data[key] = key === 'name' ? name : text(row[key]);
      const next = stamped(existing, data);
      firstError(validateCompany(next, { companies: list('companies') }));
      return ['companies', next, existing];
    },

    Contacts(row, has, spec, seen) {
      const email = text(row.email);
      const name = text(row.name);
      const { id, existing } = target('contacts', row, seen, () => {
        if (email) return list('contacts').find((c) => lower(c.email) === email.toLowerCase()) ?? null;
        const companyName = companyKey(text(row.company));
        const matches = list('contacts').filter((c) => lower(c.name) === lower(name) && companyKey(c.company) === companyName);
        return matches.length === 1 ? matches[0] : null;
      });
      const data = { id };
      for (const key of ['name', 'email', 'phone', 'title', 'source', 'notes']) if (has[key] || !existing) data[key] = text(row[key]);
      if (has.status || !existing) data.status = enumValue(spec.col.status, row.status, existing?.status || 'prospect');
      if (email && !EMAIL.test(email)) throw new RowError(`"${email}" is not a valid email`);
      if (has.company || !existing) {
        const company = findOrCreateCompany(row.company);
        data.companyId = company?.id ?? null;
        data.company = company?.name ?? '';
      }
      if (has.tags || !existing) data.tags = findOrCreateTags(row.tags);
      const next = stamped(existing, data);
      firstError(validateContact(next, { tags: list('tags') }));
      return ['contacts', next, existing];
    },

    Deals(row, has, spec, seen) {
      const contact = has.contact || isNew('deals', row) ? findContact(row.contact, { what: 'primary contact' }) : null;
      const title = text(row.title);
      const { id, existing } = target('deals', row, seen, () => list('deals').find((d) => lower(d.title) === lower(title) && d.contactId === contact?.id) ?? null);
      const data = { id };
      if (has.title || !existing) data.title = title;
      if (contact) {
        data.contactId = contact.id;
        if (!existing || existing.contactId !== contact.id) data.companyId = contact.companyId ?? null;
        const people = (existing?.stakeholders || []).filter((s) => s.contactId !== contact.id);
        const primary = (existing?.stakeholders || []).find((s) => s.contactId === contact.id);
        data.stakeholders = [{ contactId: contact.id, role: primary?.role || '' }, ...people];
      }
      if (has.value || !existing) {
        const value = numberValue(spec.col.value, row.value);
        if (value == null) throw new RowError('Add the deal value');
        data.value = value;
      }
      const stage = has.stage || !existing ? enumValue(spec.col.stage, row.stage, existing?.stage || 'prospect') : existing.stage;
      data.stage = stage;
      if (has.priority || !existing) data.priority = enumValue(spec.col.priority, row.priority, existing?.priority || 'medium');
      const probability = has.probability ? numberValue(spec.col.probability, row.probability, { max: 100 }) : undefined;
      if (probability != null) data.probability = probability;
      else if (!existing || existing.stage !== stage) data.probability = STAGE_PROBABILITY[stage];
      if (has.expectedCloseDate || !existing) {
        const date = dateValue(spec.col.expectedCloseDate, row.expectedCloseDate);
        data.expectedCloseDate = date ? localDay(date) : '';
      }
      if (has.lostReason || !existing) data.lostReason = text(row.lostReason);
      if (has.notes || !existing) data.notes = text(row.notes);
      if (!existing) {
        data.stageChangedAt = stamp;
        data.stageHistory = [{ stage, at: stamp }];
      } else if (existing.stage !== stage) {
        data.stageChangedAt = stamp;
        data.stageHistory = [...(existing.stageHistory || []), { stage, at: stamp }];
      }
      const next = stamped(existing, data);
      firstError(validateDeal(next, { contacts: [{ id: next.contactId }] }));
      return ['deals', next, existing];
    },

    Activities(row, has, spec, seen) {
      const fresh = isNew('activities', row);
      const contact = has.contact || fresh ? findContact(row.contact) : null;
      const type = has.type || fresh ? enumValue(spec.col.type, row.type, null) : null;
      if ((has.type || fresh) && !type) throw new RowError('Add the activity type');
      const date = has.date || fresh ? dateValue(spec.col.date, row.date) : null;
      if ((has.date || fresh) && !date) throw new RowError('Add the date');
      const title = text(row.title);
      const { id, existing } = target('activities', row, seen, () => list('activities').find((a) => (
        a.contactId === contact?.id && a.type === type && lower(a.title) === lower(title)
        && Math.abs(new Date(a.date) - date) < 60_000
      )) ?? null);
      const data = { id };
      if (type) {
        data.type = type;
        if (type === 'whatsapp' && existing?.type !== 'whatsapp') data.channel = 'whatsapp';
      }
      if (date) data.date = existing?.date && Math.abs(new Date(existing.date) - date) < 60_000 ? existing.date : date.toISOString();
      if (contact) {
        data.contactId = contact.id;
        data.companyId = contact.companyId ?? null;
      }
      if (has.status || !existing) data.status = enumValue(spec.col.status, row.status, existing?.status || (date > now ? 'planned' : 'done'));
      if (has.deal || !existing) data.dealId = findDeal(row.deal)?.id ?? null;
      for (const key of ['title', 'description', 'outcome']) if (has[key] || !existing) data[key] = text(row[key]);
      if (has.duration || !existing) data.duration = numberValue(spec.col.duration, row.duration);
      const next = stamped(existing, data);
      const deal = next.dealId ? draft.deals.get(next.dealId) : null;
      firstError(validateActivity(next, { contacts: [draft.contacts.get(next.contactId)].filter(Boolean), deals: deal ? [deal] : [] }));
      return ['activities', next, existing];
    },

    Customers(row, has, spec, seen) {
      const contact = has.contact || isNew('customers', row) ? findContact(row.contact) : null;
      const { id, existing } = target('customers', row, seen, () => list('customers').find((c) => c.contactId === contact.id)
        ?? (contact.companyId ? list('customers').find((c) => c.companyId === contact.companyId) : null) ?? null);
      const data = { id };
      if (contact) {
        data.contactId = contact.id;
        data.companyId = contact.companyId ?? null;
      }
      if (has.deal || !existing) data.convertedDealId = findDeal(row.deal)?.id ?? null;
      if (has.convertedAt || !existing) {
        const since = dateValue(spec.col.convertedAt, row.convertedAt);
        const sameDay = since && existing?.convertedAt && localDay(new Date(existing.convertedAt)) === localDay(since);
        data.convertedAt = since && !sameDay ? since.toISOString() : existing?.convertedAt ?? stamp;
      }
      if (has.rating || !existing) {
        const rating = numberValue(spec.col.rating, row.rating, { min: 1, max: 5 });
        data.satisfactionRating = rating == null ? null : Math.round(rating);
      }
      if (has.notes || !existing) data.notes = text(row.notes);
      const next = stamped(existing, data);
      if (!draft.contacts.has(next.contactId)) throw new RowError('Add the contact');
      return ['customers', next, existing];
    },

    Orders(row, has, spec, seen) {
      const fresh = isNew('orders', row);
      const customer = has.customer || fresh ? findCustomer(row.customer) : null;
      const description = text(row.description);
      const date = has.date || fresh ? dateValue(spec.col.date, row.date) : null;
      const { id, existing } = target('orders', row, seen, () => list('orders').find((o) => (
        o.customerId === customer?.id && lower(o.description) === lower(description) && o.date === (date ? localDay(date) : '')
      )) ?? null);
      const data = { id };
      if (customer) data.customerId = customer.id;
      if (has.description || !existing) data.description = description;
      if (has.amount || !existing) data.amount = numberValue(spec.col.amount, row.amount);
      if (date) data.date = localDay(date);
      if (has.status || !existing) data.status = enumValue(spec.col.status, row.status, existing?.status || 'completed');
      if (has.notes || !existing) data.notes = text(row.notes);
      const next = stamped(existing, data);
      if (next.amount == null) throw new RowError('Add the amount');
      firstError(validateOrder(next));
      return ['orders', next, existing];
    },
  };

  function findCustomer(value) {
    const raw = text(value);
    if (!raw) throw new RowError('Add the customer');
    if (draft.customers.has(raw)) return draft.customers.get(raw);
    let contact = null;
    try {
      contact = findContact(raw);
    } catch { /* try a company name next */ }
    const company = contact?.companyId
      ? draft.companies.get(contact.companyId)
      : list('companies').find((c) => companyKey(c.name) === companyKey(raw));
    const found = (contact && list('customers').find((c) => c.contactId === contact.id))
      || (company && list('customers').find((c) => c.companyId === company.id));
    if (found) return found;
    throw new RowError(`No customer matches "${raw}". Add them on the Customers sheet first`);
  }

  const sheetsByName = new Map(workbook.sheets.map((sheet) => [norm(sheet.name), sheet]));
  const known = specs.filter((spec) => sheetsByName.has(norm(spec.name)));
  if (!known.length) {
    return { ops: [], counts, problems: [{ sheet: '', row: 0, message: 'This workbook has none of the NEXUS sheets (Contacts, Deals, …). Start from the template in Settings.' }], warnings, rows: 0 };
  }

  const order = ['Tags', 'Companies', 'Contacts', 'Deals', 'Deal people', 'Activities', 'Customers', 'Orders'];
  const peopleRows = [];
  for (const name of order) {
    const spec = specs.find((item) => item.name === name);
    const sheet = sheetsByName.get(norm(name));
    if (!sheet) continue;
    const headerIndex = sheet.rows.findIndex((row) => row.some((cell) => text(cell)));
    if (headerIndex < 0) continue;
    const columns = new Map();
    sheet.rows[headerIndex].forEach((cell, index) => {
      const header = norm(text(cell));
      if (!header) return;
      const column = spec.columns.find((col) => norm(col.header) === header || (col.aliases || []).some((alias) => norm(alias) === header));
      if (column) columns.set(index, column);
      else warnings.push(`${spec.name}: the column "${text(cell)}" isn't one NEXUS knows, so it was ignored`);
    });
    spec.col = Object.fromEntries(spec.columns.map((column) => [column.key, column]));
    const present = new Set([...columns.values()].map((column) => column.key));
    const missing = spec.columns.filter((column) => column.required && !present.has(column.key) && column.key !== 'id');
    const seen = new Map();
    for (let r = headerIndex + 1; r < sheet.rows.length; r += 1) {
      const cells = sheet.rows[r] || [];
      if (!cells.some((cell) => text(cell))) continue;
      rows += 1;
      const row = {};
      columns.forEach((column, index) => { row[column.key] = cells[index] ?? null; });
      const has = Object.fromEntries([...present].map((key) => [key, true]));
      journal = [];
      try {
        if (!text(row.id) && missing.length) throw new RowError(`The sheet needs a ${missing.map((column) => column.header).join(' and ')} column for new rows`);
        if (name === 'Deal people') {
          const deal = findDeal(row.deal, { required: true });
          const contact = findContact(row.contact);
          const role = has.role ? enumValue(spec.col.role, row.role, '') : '';
          peopleRows.push({ deal, contact, role, row: r + 1 });
          continue;
        }
        const [collection, next] = handlers[name](row, has, spec, seen);
        seen.set(next.id, r + 1);
        put(collection, next);
      } catch (error) {
        if (!(error instanceof RowError)) throw error;
        rollback(journal);
        problems.push({ sheet: spec.name, row: r + 1, message: error.message });
      }
    }
  }
  journal = null;

  const people = new Map();
  for (const item of peopleRows) {
    const deal = draft.deals.get(item.deal.id);
    if (!people.has(deal.id)) people.set(deal.id, new Map());
    people.get(deal.id).set(item.contact.id, item.role);
  }
  for (const [dealId, members] of people) {
    const deal = draft.deals.get(dealId);
    if (!members.has(deal.contactId)) {
      const primaryRole = (deal.stakeholders || []).find((s) => s.contactId === deal.contactId)?.role || '';
      members.set(deal.contactId, primaryRole);
    }
    const stakeholders = [...members].map(([contactId, role]) => ({ contactId, role }));
    stakeholders.sort((a, b) => (a.contactId === deal.contactId ? -1 : b.contactId === deal.contactId ? 1 : 0));
    put('deals', { ...deal, stakeholders, updatedAt: stamp });
  }

  for (const { id } of [...touched.values()].filter((item) => item.collection === 'companies')) {
    const company = draft.companies.get(id);
    for (const contact of list('contacts')) {
      if (contact.companyId === id && contact.company !== company.name) put('contacts', { ...contact, company: company.name, updatedAt: stamp });
    }
  }
  for (const customer of [...touched.values()].filter((item) => item.collection === 'customers')) {
    const record = draft.customers.get(customer.id);
    const contact = draft.contacts.get(record.contactId);
    if (contact && contact.status !== 'customer' && !original.has(`customers/${record.id}`)) {
      put('contacts', { ...contact, status: 'customer', updatedAt: stamp });
    }
  }

  const ops = [];
  for (const { collection, id } of touched.values()) {
    const next = draft[collection].get(id);
    const before = original.get(`${collection}/${id}`);
    if (before && same(before, next)) {
      counts[collection].unchanged += 1;
      continue;
    }
    counts[collection][before ? 'updated' : 'created'] += 1;
    ops.push({ op: 'upsert', collection, id, data: next });
  }
  return { ops, counts, problems, warnings: [...new Set(warnings)], rows };
}
