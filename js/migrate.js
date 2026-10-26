export const CURRENT_VERSION = 2;

export function companyKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function newId() {
  return crypto.randomUUID();
}

function earliest(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

/**
 * Upgrades a stored document to the current version without dropping records.
 * Safe to run on an already-current document: it only fills gaps.
 */
export function migrate(input, { now = new Date(), id = newId } = {}) {
  const state = JSON.parse(JSON.stringify(input));
  const stamp = now.toISOString();
  state.companies = Array.isArray(state.companies) ? state.companies : [];
  for (const key of ['contacts', 'deals', 'activities', 'customers', 'orders', 'tags']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }

  const byKey = new Map(state.companies.map((company) => [companyKey(company.name), company]));
  const byId = new Map(state.companies.map((company) => [company.id, company]));

  for (const contact of state.contacts) {
    if (contact.companyId && byId.has(contact.companyId)) {
      contact.company = byId.get(contact.companyId).name;
      continue;
    }
    const key = companyKey(contact.company);
    if (!key) {
      contact.companyId = null;
      continue;
    }
    let company = byKey.get(key);
    if (!company) {
      company = {
        id: id(),
        name: String(contact.company).trim().replace(/\s+/g, ' '),
        website: '',
        industry: '',
        notes: '',
        createdAt: contact.createdAt || stamp,
        updatedAt: stamp,
      };
      state.companies.push(company);
      byKey.set(key, company);
      byId.set(company.id, company);
    } else {
      company.createdAt = earliest(company.createdAt, contact.createdAt);
    }
    contact.companyId = company.id;
    contact.company = company.name;
  }

  const contactCompany = new Map(state.contacts.map((contact) => [contact.id, contact.companyId ?? null]));

  for (const deal of state.deals) {
    if (!deal.companyId || !byId.has(deal.companyId)) deal.companyId = contactCompany.get(deal.contactId) ?? null;
    const stakeholders = Array.isArray(deal.stakeholders) ? deal.stakeholders.filter((item) => item?.contactId) : [];
    if (deal.contactId && !stakeholders.some((item) => item.contactId === deal.contactId)) {
      stakeholders.unshift({ contactId: deal.contactId, role: '' });
    }
    deal.stakeholders = stakeholders;
  }

  for (const activity of state.activities) {
    if (activity.status !== 'planned' && activity.status !== 'done') activity.status = 'done';
    if (activity.companyId === undefined || (activity.companyId && !byId.has(activity.companyId))) {
      activity.companyId = contactCompany.get(activity.contactId) ?? null;
    }
  }

  for (const customer of state.customers) {
    if (!customer.companyId || !byId.has(customer.companyId)) customer.companyId = contactCompany.get(customer.contactId) ?? null;
  }

  const keep = new Map();
  const merged = [];
  for (const customer of state.customers) {
    if (!customer.companyId) {
      merged.push(customer);
      continue;
    }
    const existing = keep.get(customer.companyId);
    if (!existing) {
      keep.set(customer.companyId, customer);
      merged.push(customer);
      continue;
    }
    const [primary, secondary] = new Date(customer.convertedAt) < new Date(existing.convertedAt)
      ? [customer, existing]
      : [existing, customer];
    for (const order of state.orders) {
      if (order.customerId === secondary.id) order.customerId = primary.id;
    }
    primary.notes = [primary.notes, secondary.notes].filter((text) => String(text ?? '').trim()).join('\n\n');
    primary.satisfactionRating = primary.satisfactionRating ?? secondary.satisfactionRating ?? null;
    if (primary !== existing) {
      merged[merged.indexOf(existing)] = primary;
      keep.set(customer.companyId, primary);
    }
  }
  state.customers = merged;

  state.version = CURRENT_VERSION;
  return state;
}

export function needsMigration(state) {
  return !state || state.version !== CURRENT_VERSION || !Array.isArray(state.companies);
}
