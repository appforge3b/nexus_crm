import { describe, expect, it } from 'vitest';
import { filterActivities, filterContacts, filterCustomers, filterDeals } from '../../js/filters.js';
import { at } from '../helpers/time.js';

const contacts = [
  { id: 'c1', name: 'Ravi Krishnan', company: 'Tata Digital', email: 'ravi@tata.example', status: 'prospect' },
  { id: 'c2', name: 'Priya Shah', company: 'Northwind', email: 'priya@northwind.example', status: 'customer' },
  { id: 'c3', name: 'Aman', company: 'Quiet', email: 'aman@quiet.example', status: 'inactive' },
  { id: 'c4', name: 'Leela', company: 'Active Co', email: 'leela@active.example', status: 'active' },
];

const deals = [
  { id: 'd1', title: 'Radar refresh', contactId: 'c1', value: 100, priority: 'high', createdAt: at(2026, 10, 2).toISOString() },
  { id: 'd2', title: 'Support retainer', contactId: 'c2', value: 400, priority: 'low', createdAt: at(2026, 9, 2).toISOString() },
  { id: 'd3', title: 'Pilot', contactId: 'c1', value: 250, priority: 'critical', createdAt: at(2026, 10, 20).toISOString() },
];

describe('deal filters', () => {
  it('matches title, company, and contact name without case sensitivity', () => {
    expect(filterDeals(deals, contacts, { search: '  RADAR ' }).map((deal) => deal.id)).toEqual(['d1']);
    expect(filterDeals(deals, contacts, { search: 'northwind' }).map((deal) => deal.id)).toEqual(['d2']);
    expect(filterDeals(deals, contacts, { search: 'ravi' }).map((deal) => deal.id)).toEqual(['d1', 'd3']);
  });

  it('applies inclusive value, priority, and created-date bounds together', () => {
    const filtered = filterDeals(deals, contacts, {
      minValue: 100,
      maxValue: 250,
      priorities: ['high', 'critical'],
      createdFrom: '2026-10-01',
      createdTo: '2026-10-31',
    });
    expect(filtered.map((deal) => deal.id)).toEqual(['d1', 'd3']);
    expect(filterDeals(deals, contacts, { minValue: 250, maxValue: 250 }).map((deal) => deal.id)).toEqual(['d3']);
    expect(filterDeals(deals, contacts, {})).toHaveLength(3);
  });
});

describe('contact, activity, and customer filters', () => {
  it('filters roster tabs and leaves active contacts out of the three named tabs', () => {
    expect(filterContacts(contacts, { status: 'all' })).toHaveLength(4);
    expect(filterContacts(contacts, { status: 'prospect' }).map((contact) => contact.id)).toEqual(['c1']);
    expect(filterContacts(contacts, { status: 'customer' }).map((contact) => contact.id)).toEqual(['c2']);
    expect(filterContacts(contacts, { status: 'inactive' }).map((contact) => contact.id)).toEqual(['c3']);
    expect(filterContacts(contacts, { query: 'PRIYA' }).map((contact) => contact.id)).toEqual(['c2']);
    expect(filterContacts(contacts, { query: 'northwind.example' }).map((contact) => contact.id)).toEqual(['c2']);
  });

  it('filters the chronicle by type, contact, and inclusive dates', () => {
    const activities = [
      { id: 'a1', type: 'call', contactId: 'c1', date: at(2026, 10, 2, 9).toISOString() },
      { id: 'a2', type: 'email', contactId: 'c1', date: at(2026, 10, 5, 9).toISOString() },
      { id: 'a3', type: 'call', contactId: 'c2', date: at(2026, 10, 9, 9).toISOString() },
    ];
    expect(filterActivities(activities, { type: 'call' }).map((item) => item.id)).toEqual(['a1', 'a3']);
    expect(filterActivities(activities, { contactId: 'c1', from: '2026-10-05', to: '2026-10-05' }).map((item) => item.id)).toEqual(['a2']);
  });

  it('filters customers through the linked contact name and company', () => {
    const customers = [
      { id: 'cu1', contactId: 'c2' },
      { id: 'cu2', contactId: 'c1' },
    ];
    expect(filterCustomers(customers, contacts, 'tata').map((customer) => customer.id)).toEqual(['cu2']);
    expect(filterCustomers(customers, contacts, '')).toHaveLength(2);
  });
});
