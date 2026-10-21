import { describe, expect, it } from 'vitest';
import { validateActivity, validateContact, validateDeal, validateImport, validateOrder, validateTag } from '../../js/validation.js';
import {
  IMPORT_WARNING,
  backwardMoveMessage,
  conversionMessage,
  deleteContactMessage,
  deleteDealMessage,
  importPreviewText,
} from '../../js/copy.js';

const contacts = [{ id: 'c1', name: 'Ravi' }];
const tags = [{ id: 't1', name: 'Tech' }];

describe('form validation', () => {
  it('requires a contact name and rejects a malformed email', () => {
    expect(validateContact({ name: '  ' }, { tags })).toEqual({
      ok: false,
      errors: [{ field: 'name', message: 'Name is required' }],
    });
    expect(validateContact({ name: 'Ravi', email: 'nope' }, { tags })).toEqual({
      ok: false,
      errors: [{ field: 'email', message: 'Email is invalid' }],
    });
    expect(validateContact({ name: 'Ravi', email: '', status: 'prospect', tags: ['t1'] }, { tags })).toMatchObject({ ok: true });
    expect(validateContact({ name: 'Ravi', tags: ['missing'] }, { tags }).ok).toBe(false);
  });

  it('requires deal title, a real contact, a non-negative value, and a lost reason', () => {
    expect(validateDeal({ title: '', contactId: '', value: -1 }, { contacts }).ok).toBe(false);
    const errors = validateDeal({ title: '', contactId: '', value: -1 }, { contacts }).errors.map((error) => error.message);
    expect(errors).toEqual(expect.arrayContaining([
      'Title is required',
      'Contact is required',
      'Value must be zero or greater',
    ]));
    expect(validateDeal({
      title: 'Expansion', contactId: 'c1', value: 0, stage: 'lost', lostReason: '  ',
    }, { contacts }).errors).toEqual([{ field: 'lostReason', message: 'Lost reason is required' }]);
    expect(validateDeal({
      title: 'Expansion', contactId: 'missing', value: 10, stage: 'prospect',
    }, { contacts }).ok).toBe(false);
    expect(validateDeal({
      title: 'Expansion', contactId: 'c1', value: 10, stage: 'prospect', priority: 'high', probability: 10,
    }, { contacts })).toMatchObject({ ok: true });
  });

  it('requires activity contact, title, and date, and keeps the deal on that contact', () => {
    const deals = [{ id: 'd1', contactId: 'c1' }, { id: 'd2', contactId: 'c2' }];
    expect(validateActivity({ type: 'call', contactId: '', title: '', date: '' }, { contacts, deals }).ok).toBe(false);
    expect(validateActivity({
      type: 'email', contactId: 'c1', dealId: 'd2', title: 'Note', date: '2026-10-21T09:00:00.000Z',
    }, { contacts, deals }).ok).toBe(false);
    expect(validateActivity({
      type: 'call', contactId: 'c1', dealId: 'd1', title: 'Intro', date: '2026-10-21T09:00:00.000Z', duration: 30,
    }, { contacts, deals })).toMatchObject({ ok: true });
    expect(validateActivity({
      type: 'note', contactId: 'c1', title: 'Note', date: '2026-10-21', duration: -5,
    }, { contacts, deals }).ok).toBe(false);
  });

  it('validates orders and unique tag names', () => {
    expect(validateOrder({ description: '', amount: -1, date: '' }).ok).toBe(false);
    expect(validateOrder({
      customerId: 'cu1', description: 'Renewal', amount: 0, status: 'pending', date: '2026-10-21',
    })).toMatchObject({ ok: true });
    expect(validateTag({ name: '', color: 'blue' }, { tags }).ok).toBe(false);
    expect(validateTag({ name: 'tech', color: '#112233' }, { tags }).errors).toEqual([
      { field: 'name', message: 'Tag already exists' },
    ]);
    expect(validateTag({ name: 'Finance', color: '#10b981' }, { tags })).toMatchObject({ ok: true });
  });

  it('accepts a full import document and rejects a partial one', () => {
    const valid = {
      contacts: [], deals: [], activities: [], customers: [], orders: [], tags: [], settings: {}, version: 1,
    };
    expect(validateImport(valid)).toMatchObject({ ok: true });
    expect(validateImport({ contacts: [] }).ok).toBe(false);
    expect(validateImport(null).ok).toBe(false);
    expect(validateImport('nope').ok).toBe(false);
  });
});

describe('confirmation copy', () => {
  it('states the irreversible outcome and the import preview counts', () => {
    expect(deleteContactMessage('Ravi', 0)).toBe('Delete Ravi? This cannot be undone.');
    expect(deleteContactMessage('Ravi', 2)).toBe('Delete Ravi? This contact has 2 associated deals, which will also be deleted. This cannot be undone.');
    expect(deleteDealMessage('Expansion')).toBe('Delete Expansion? This cannot be undone.');
    expect(backwardMoveMessage('Qualified')).toBe('Move this deal back to Qualified? This usually indicates a setback.');
    expect(conversionMessage('Ravi Krishnan')).toBe('Convert Ravi Krishnan to a customer?');
    expect(IMPORT_WARNING).toBe('This will replace ALL existing data. This action cannot be undone.');
    expect(importPreviewText({ contacts: 1, deals: 1, activities: 1, customers: 1, orders: 1, tags: 1 }))
      .toBe('This file contains: 1 contact, 1 deal, 1 activity, 1 customer, 1 order, 1 tag.');
    expect(importPreviewText({ contacts: 2, deals: 0, activities: 0, customers: 0, orders: 0, tags: 0 }))
      .toBe('This file contains: 2 contacts, 0 deals, 0 activities, 0 customers, 0 orders, 0 tags.');
  });
});
