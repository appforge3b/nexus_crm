import { beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

function button(label, root = document) {
  return [...root.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
}

describe('editing and lifecycle flows', () => {
  let app;
  let contact;
  let deal;
  let activity;

  beforeEach(() => {
    app = mount({ hash: '#/pipeline' });
    contact = app.store.create('contacts', {
      name: 'Meera Nair', company: 'Lumen Health', title: 'CFO', status: 'active',
      email: 'meera@lumen.example', phone: '+91 98000 00000', tags: [], notes: '', source: 'Event',
    });
    deal = app.store.create('deals', {
      title: 'Patient portal', contactId: contact.id, value: 400000, stage: 'proposal',
      priority: 'high', probability: 40, expectedCloseDate: '2026-11-20', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 14, 9).toISOString(),
    });
    activity = app.store.create('activities', {
      type: 'call', contactId: contact.id, dealId: deal.id, title: 'Scoping call',
      description: 'Walked through integration needs.', date: at(2026, 10, 20, 11).toISOString(), duration: 30, outcome: '',
    });
  });

  it('edits a deal from its detail panel with the form pre-filled', () => {
    click(document.querySelector(`[data-deal-id="${deal.id}"]`));
    click(document.querySelector('[data-panel="deal"] [data-action="edit-deal"]'));

    const dialog = document.querySelector('[role="dialog"]');
    expect(field('title', dialog).value).toBe('Patient portal');
    expect(field('value', dialog).value).toBe('400000');

    setValue(field('title', dialog), 'Patient portal phase 2');
    setValue(field('value', dialog), '650000');
    click(button('Save', dialog));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(app.store.getById('deals', deal.id)).toMatchObject({ title: 'Patient portal phase 2', value: 650000 });
    expect(document.querySelector(`[data-deal-id="${deal.id}"]`).textContent).toContain('₹6,50,000');
  });

  it('requires a value instead of silently saving a zero-value deal', () => {
    click(document.querySelector('[data-action="new-deal"]'));
    const dialog = document.querySelector('[role="dialog"]');
    setValue(field('title', dialog), 'Empty value');
    setValue(field('contact', dialog), contact.id);
    click(button('Save', dialog));
    expect(dialog.querySelector('[data-error-for="value"]').textContent).toMatch(/required/i);
    expect(app.store.query('deals', (item) => item.title === 'Empty value')).toHaveLength(0);
  });

  it('keeps the same focused search input and caret while results re-render', () => {
    const search = document.querySelector('[data-search]');
    search.focus();
    search.value = 'lumen';
    search.setSelectionRange(5, 5);
    search.dispatchEvent(new Event('input', { bubbles: true }));
    app.store.update('deals', deal.id, { notes: 'touch' });

    const active = document.activeElement;
    expect(active.matches('[data-search]')).toBe(true);
    expect(active.value).toBe('lumen');
    expect(active.selectionStart).toBe(5);
  });

  it('edits an activity from the chronicle', () => {
    window.location.hash = '#/chronicle';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    click(document.querySelector(`[data-activity-id="${activity.id}"] [data-action="edit-activity"]`));

    const dialog = document.querySelector('[role="dialog"]');
    expect(field('title', dialog).value).toBe('Scoping call');
    setValue(field('title', dialog), 'Scoping call (follow-up booked)');
    click(button('Save', dialog));

    expect(app.store.getById('activities', activity.id).title).toBe('Scoping call (follow-up booked)');
    expect(document.querySelector('[data-view="chronicle"]').textContent).toContain('Scoping call (follow-up booked)');
  });

  it('deleting a contact removes their deals, activities, and customer records', () => {
    const customer = app.store.create('customers', {
      contactId: contact.id, convertedAt: at(2026, 9, 1).toISOString(), satisfactionRating: 4, notes: '',
    });
    app.store.create('orders', {
      customerId: customer.id, description: 'Pilot', amount: 100000, status: 'completed', date: '2026-09-02', notes: '',
    });
    window.location.hash = `#/roster?contact=${contact.id}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    click(document.querySelector('[data-panel="contact"] [data-action="delete"]'));
    click(button('Delete', document.querySelector('[role="alertdialog"]')));

    expect(app.store.getAll('contacts')).toHaveLength(0);
    expect(app.store.getAll('deals')).toHaveLength(0);
    expect(app.store.getAll('activities')).toHaveLength(0);
    expect(app.store.getAll('customers')).toHaveLength(0);
    expect(app.store.getAll('orders')).toHaveLength(0);
  });

  it('deleting a deal keeps its activities but unlinks them', () => {
    click(document.querySelector(`[data-deal-id="${deal.id}"]`));
    click(document.querySelector('[data-panel="deal"] [data-action="delete"]'));
    click(button('Delete', document.querySelector('[role="alertdialog"]')));

    expect(app.store.getById('deals', deal.id)).toBeFalsy();
    expect(app.store.getById('activities', activity.id).dealId).toBeNull();
  });
});
