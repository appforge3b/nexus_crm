import { ACTIVE_STAGES } from './stages.js';
import { companyKey } from './migrate.js';

export { companyKey };

export const STAKEHOLDER_ROLES = ['Decision maker', 'Champion', 'Influencer', 'Finance', 'Technical', 'User', 'Blocker'];

export function findCompanyByName(companies, name) {
  const key = companyKey(name);
  if (!key) return null;
  return (companies ?? []).find((company) => companyKey(company.name) === key) ?? null;
}

/** Resolves a contact's company by id, falling back to the free-text company name. */
export function companyOf(contact, companies) {
  if (!contact) return null;
  if (contact.companyId) {
    const found = (companies ?? []).find((company) => company.id === contact.companyId);
    if (found) return found;
  }
  return findCompanyByName(companies, contact.company);
}

export function companyIdOf(contact, companies) {
  return companyOf(contact, companies)?.id ?? null;
}

export function peopleAt(company, contacts, companies) {
  if (!company) return [];
  return (contacts ?? [])
    .filter((contact) => companyOf(contact, companies)?.id === company.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Primary contact first, then every other stakeholder, de-duplicated. */
export function stakeholderEntries(deal) {
  const list = [];
  const seen = new Set();
  const add = (contactId, role) => {
    if (!contactId || seen.has(contactId)) return;
    seen.add(contactId);
    list.push({ contactId, role: role || '', primary: contactId === deal.contactId });
  };
  const roles = new Map((deal?.stakeholders ?? []).map((item) => [item.contactId, item.role]));
  add(deal?.contactId, roles.get(deal?.contactId));
  for (const item of deal?.stakeholders ?? []) add(item.contactId, item.role);
  return list;
}

export function stakeholdersFor(deal, contacts) {
  const byId = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
  return stakeholderEntries(deal)
    .map((entry) => ({ ...entry, contact: byId.get(entry.contactId) ?? null }))
    .filter((entry) => entry.contact);
}

export function dealContactIds(deal) {
  return stakeholderEntries(deal).map((entry) => entry.contactId);
}

export function dealCompanyId(deal, contacts, companies) {
  if (deal?.companyId) return deal.companyId;
  const contact = (contacts ?? []).find((item) => item.id === deal?.contactId);
  return companyIdOf(contact, companies);
}

export function dealsForCompany(company, deals, contacts, companies) {
  if (!company) return [];
  return (deals ?? []).filter((deal) => dealCompanyId(deal, contacts, companies) === company.id);
}

export function openDealsForCompany(company, deals, contacts, companies) {
  return dealsForCompany(company, deals, contacts, companies).filter((deal) => ACTIVE_STAGES.includes(deal.stage));
}

export function activityCompanyId(activity, contacts, companies) {
  if (activity?.companyId) return activity.companyId;
  const contact = (contacts ?? []).find((item) => item.id === activity?.contactId);
  return companyIdOf(contact, companies);
}

export function activitiesForCompany(company, activities, contacts, companies) {
  if (!company) return [];
  return (activities ?? []).filter((activity) => activityCompanyId(activity, contacts, companies) === company.id);
}

export function customerCompanyId(customer, contacts, companies) {
  if (customer?.companyId) return customer.companyId;
  const contact = (contacts ?? []).find((item) => item.id === customer?.contactId);
  return companyIdOf(contact, companies);
}

/** Returns the id of the named company, creating it when it does not exist yet. Blank names return null. */
export function ensureCompany(store, name) {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const existing = findCompanyByName(store.getAll('companies'), trimmed);
  if (existing) return existing.id;
  return store.create('companies', { name: trimmed, website: '', industry: '', notes: '' }).id;
}
