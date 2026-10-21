import { calendarKey } from './format.js';

function includes(query, ...fields) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field ?? '').toLowerCase().includes(needle));
}

function within(iso, from, to) {
  const key = calendarKey(iso);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function filterDeals(deals, contacts, criteria = {}) {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return deals.filter((deal) => {
    const contact = byId.get(deal.contactId);
    if (!includes(criteria.search, deal.title, contact?.company, contact?.name)) return false;
    if (criteria.minValue != null && criteria.minValue !== '' && Number(deal.value) < Number(criteria.minValue)) return false;
    if (criteria.maxValue != null && criteria.maxValue !== '' && Number(deal.value) > Number(criteria.maxValue)) return false;
    if (criteria.priorities?.length && !criteria.priorities.includes(deal.priority)) return false;
    if ((criteria.createdFrom || criteria.createdTo) && !within(deal.createdAt, criteria.createdFrom, criteria.createdTo)) return false;
    return true;
  });
}

export function filterContacts(contacts, { query = '', status = 'all' } = {}) {
  return contacts.filter((contact) => {
    if (status && status !== 'all' && contact.status !== status) return false;
    return includes(query, contact.name, contact.company, contact.email);
  });
}

export function filterActivities(activities, criteria = {}) {
  return activities.filter((activity) => {
    if (criteria.type && criteria.type !== 'all' && activity.type !== criteria.type) return false;
    if (criteria.contactId && activity.contactId !== criteria.contactId) return false;
    if ((criteria.from || criteria.to) && !within(activity.date, criteria.from, criteria.to)) return false;
    return true;
  });
}

export function filterCustomers(customers, contacts, query) {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return customers.filter((customer) => {
    const contact = byId.get(customer.contactId);
    return includes(query, contact?.name, contact?.company);
  });
}
