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
    expect(data.contacts.length).toBeLessThanOrEqual(8);
    expect(data.deals.length).toBeGreaterThanOrEqual(10);
    expect(data.deals.length).toBeLessThanOrEqual(15);
    expect(data.activities.length).toBeGreaterThanOrEqual(15);
    expect(data.activities.length).toBeLessThanOrEqual(20);
    expect(data.customers.length).toBeGreaterThanOrEqual(2);
    expect(data.customers.length).toBeLessThanOrEqual(3);
    expect(data.tags.map((tag) => tag.name)).toEqual(DEFAULT_TAG_NAMES);
    expect(data.version).toBe(1);
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
      'call', 'email', 'meeting', 'note',
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

    const ids = [
      ...data.contacts, ...data.deals, ...data.activities, ...data.customers, ...data.orders, ...data.tags,
    ].map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entity of [...data.contacts, ...data.deals, ...data.activities, ...data.customers, ...data.orders, ...data.tags]) {
      expect(entity.createdAt).toMatch(ISO);
      expect(entity.updatedAt).toMatch(ISO);
    }
  });
});
