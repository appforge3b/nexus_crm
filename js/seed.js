import { defaultSettings } from './settings.js';
import { STAGE_PROBABILITY } from './stages.js';

export const DEFAULT_TAG_NAMES = [
  'Enterprise', 'SMB', 'Tech', 'Finance', 'Decision Maker', 'Influencer', 'Champion', 'Hot Lead',
];

const TAG_COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#14b8a6', '#f97316'];

function iso(date) {
  return date.toISOString();
}

function daysAgo(clock, days) {
  return new Date(clock.getTime() - days * 86400000);
}

function daysAhead(clock, days) {
  const date = new Date(clock.getTime() + days * 86400000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const CLOSE_IN_DAYS = {
  prospect: 28,
  qualified: 18,
  proposal: 12,
  negotiation: 6,
  closing: 2,
};

export function seedDemoData(clock) {
  const now = clock instanceof Date ? clock : new Date(clock);
  const tags = DEFAULT_TAG_NAMES.map((name, index) => ({
    id: `tag-${index + 1}`,
    name,
    color: TAG_COLORS[index],
    createdAt: iso(daysAgo(now, 40)),
    updatedAt: iso(daysAgo(now, 40)),
  }));

  const people = [
    ['Asha Menon', 'Northwind', 'VP Sales', 'prospect', 'asha@northwind.example'],
    ['Ravi Krishnan', 'Tata Digital', 'CTO', 'active', 'ravi@tata.example'],
    ['Priya Shah', 'Helios Bank', 'CFO', 'prospect', 'priya@helios.example'],
    ['Kabir Das', 'Orbit Labs', 'Founder', 'active', 'kabir@orbit.example'],
    ['Leela Iyer', 'Saffron Retail', 'Head of Ops', 'customer', 'leela@saffron.example'],
    ['Neel Kapoor', 'Monsoon Media', 'Director', 'customer', 'neel@monsoon.example'],
    ['Farah Qureshi', 'Lumen Health', 'Procurement', 'inactive', 'farah@lumen.example'],
    ['Dev Patel', 'Copper & Co', 'CEO', 'customer', 'dev@copper.example'],
  ];

  const contacts = people.map((person, index) => ({
    id: `contact-${index + 1}`,
    name: person[0],
    company: person[1],
    title: person[2],
    status: person[3],
    email: person[4],
    phone: `+91 98000 000${index}`,
    tags: [tags[index % tags.length].id],
    notes: '',
    source: index % 2 === 0 ? 'Referral' : 'Inbound',
    createdAt: iso(daysAgo(now, 30 - index)),
    updatedAt: iso(daysAgo(now, 2)),
  }));

  const stagePlan = [
    'prospect', 'prospect', 'qualified', 'qualified', 'proposal', 'proposal',
    'negotiation', 'negotiation', 'closing', 'closing', 'won', 'won', 'lost', 'lost',
  ];
  const deals = stagePlan.map((stage, index) => ({
    id: `deal-${index + 1}`,
    title: `${contacts[index % contacts.length].company} engagement ${index + 1}`,
    contactId: contacts[index % contacts.length].id,
    value: 80000 + index * 25000,
    stage,
    priority: ['low', 'medium', 'high', 'critical'][index % 4],
    probability: STAGE_PROBABILITY[stage],
    expectedCloseDate: CLOSE_IN_DAYS[stage] == null ? '' : daysAhead(now, CLOSE_IN_DAYS[stage] + (index % 2)),
    notes: '',
    lostReason: stage === 'lost' ? 'Price' : '',
    stageChangedAt: iso(daysAgo(now, 6)),
    createdAt: iso(daysAgo(now, 20 - index)),
    updatedAt: iso(daysAgo(now, 6)),
  }));

  const types = ['call', 'email', 'meeting', 'note'];
  const activities = Array.from({ length: 16 }, (_, index) => ({
    id: `activity-${index + 1}`,
    type: types[index % 4],
    contactId: contacts[index % contacts.length].id,
    dealId: index % 2 === 0 ? deals[index % deals.length].id : null,
    title: `${types[index % 4]} ${index + 1}`,
    description: 'Logged from the demo seed.',
    date: iso(daysAgo(now, index % 12)),
    duration: types[index % 4] === 'call' || types[index % 4] === 'meeting' ? 30 : null,
    outcome: '',
    createdAt: iso(daysAgo(now, index % 12)),
    updatedAt: iso(daysAgo(now, index % 12)),
  }));

  const wonDeals = deals.filter((deal) => deal.stage === 'won');
  const customerContacts = contacts.filter((contact) => contact.status === 'customer').slice(0, 3);
  const customers = customerContacts.map((contact, index) => ({
    id: `customer-${index + 1}`,
    contactId: contact.id,
    convertedDealId: wonDeals[index % wonDeals.length].id,
    convertedAt: iso(daysAgo(now, 15)),
    satisfactionRating: 4,
    notes: '',
    createdAt: iso(daysAgo(now, 15)),
    updatedAt: iso(daysAgo(now, 1)),
  }));
  const orders = customers.flatMap((customer, index) => [{
    id: `order-${index + 1}`,
    customerId: customer.id,
    description: 'Initial order',
    amount: 120000 + index * 10000,
    status: 'completed',
    date: daysAgo(now, 10).toISOString().slice(0, 10),
    notes: '',
    createdAt: iso(daysAgo(now, 10)),
    updatedAt: iso(daysAgo(now, 10)),
  }]);

  return {
    contacts,
    deals,
    activities,
    customers,
    orders,
    tags,
    settings: defaultSettings(),
    version: 1,
  };
}
