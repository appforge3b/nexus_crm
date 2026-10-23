import { describe, expect, it } from 'vitest';
import { DEFAULT_TAG_NAMES, seedDemoData } from '../../js/seed.js';
import { STAGE_PROBABILITY } from '../../js/deals.js';
import { at } from '../helpers/time.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

describe('demo seed', () => {
  const data = seedDemoData(at(2026, 10, 21, 9));

  it('ships the required volume and the default tag set', () => {
    expect(DEFAULT_TAG_NAMES).toEqual([
      'Enterprise', 'SMB', 'Tech', 'Finance', 'Decision Maker', 'Influencer', 'Champion', 'Hot Lead',
    ]);
    expect(data.contacts.length).toBeGreaterThanOrEqual(6);
    expect(data.contacts.length).toBeLessThanOrEqual(12);
    expect(data.deals.length).toBeGreaterThanOrEqual(10);
    expect(data.deals.length).toBeLessThanOrEqual(15);
    expect(data.activities.length).toBeGreaterThanOrEqual(15);
    expect(data.activities.length).toBeLessThanOrEqual(32);
    expect(data.customers.length).toBeGreaterThanOrEqual(2);
    expect(data.customers.length).toBeLessThanOrEqual(3);
    expect(data.tags.map((tag) => tag.name)).toEqual(DEFAULT_TAG_NAMES);
    expect(data.version).toBe(2);
    expect(data.settings.currency).toBe('₹');
  });

  it('covers every pipeline stage, every activity type, and keeps foreign keys intact', () => {
    const contactIds = new Set(data.contacts.map((contact) => contact.id));
    const dealIds = new Set(data.deals.map((deal) => deal.id));
    const customerIds = new Set(data.customers.map((customer) => customer.id));
    const tagIds = new Set(data.tags.map((tag) => tag.id));

    expect(new Set(data.deals.map((deal) => deal.stage))).toEqual(new Set([
      'prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won', 'lost',
    ]));
    expect(new Set(data.activities.map((activity) => activity.type))).toEqual(new Set([
      'call', 'email', 'meeting', 'note', 'whatsapp', 'task',
    ]));

    for (const deal of data.deals) {
      expect(contactIds.has(deal.contactId)).toBe(true);
      expect(deal.probability).toBe(STAGE_PROBABILITY[deal.stage]);
      expect(deal.value).toBeGreaterThanOrEqual(0);
      if (deal.stage === 'lost') expect(deal.lostReason.trim().length).toBeGreaterThan(0);
    }
    for (const activity of data.activities) {
      expect(contactIds.has(activity.contactId)).toBe(true);
      if (activity.dealId) expect(dealIds.has(activity.dealId)).toBe(true);
    }
    for (const customer of data.customers) {
      expect(contactIds.has(customer.contactId)).toBe(true);
      expect(dealIds.has(customer.convertedDealId)).toBe(true);
      expect(data.contacts.find((contact) => contact.id === customer.contactId).status).toBe('customer');
      expect(data.orders.some((order) => order.customerId === customer.id)).toBe(true);
    }
    for (const order of data.orders) {
      expect(customerIds.has(order.customerId)).toBe(true);
      expect(order.amount).toBeGreaterThanOrEqual(0);
    }
    for (const contact of data.contacts) {
      expect(contact.tags.every((id) => tagIds.has(id))).toBe(true);
    }
    for (const tag of data.tags) expect(tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    for (const deal of data.deals) {
      expect(deal.stakeholders[0].contactId).toBe(deal.contactId);
      expect(deal.stakeholders.every((entry) => contactIds.has(entry.contactId))).toBe(true);
    }

    const ids = [
      ...data.contacts, ...data.companies, ...data.deals, ...data.activities, ...data.customers, ...data.orders, ...data.tags,
    ].map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entity of [...data.contacts, ...data.deals, ...data.activities, ...data.customers, ...data.orders, ...data.tags]) {
      expect(entity.createdAt).toMatch(ISO);
      expect(entity.updatedAt).toMatch(ISO);
    }
  });

  it('shows the new workflows: companies with several people, planned steps, WhatsApp and a voice note', () => {
    const helios = data.companies.find((company) => company.name === 'Helios Bank');
    expect(data.contacts.filter((contact) => contact.companyId === helios.id)).toHaveLength(3);
    const banking = data.deals.find((deal) => deal.title === 'Core banking integration');
    expect(banking.stakeholders.map((entry) => entry.role)).toEqual(['Champion', 'Decision maker', 'Technical']);

    const now = at(2026, 10, 21, 9);
    const planned = data.activities.filter((activity) => activity.status === 'planned');
    expect(planned.length).toBeGreaterThanOrEqual(4);
    expect(planned.some((activity) => new Date(activity.date) < now)).toBe(true);
    expect(planned.some((activity) => new Date(activity.date) > now)).toBe(true);
    expect(data.activities.some((activity) => activity.source === 'voice' && activity.durationSec > 0)).toBe(true);
    expect(data.activities.filter((activity) => activity.status !== 'planned').every((activity) => new Date(activity.date) <= now)).toBe(true);
  });
});
