import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';

describe('customer HQ', () => {
  let app;
  let contact;
  let customer;

  beforeEach(() => {
    app = mount({ hash: '#/customers' });
    contact = app.store.create('contacts', {
      name: 'John Doe', company: 'Acme Corp', title: 'Buyer', status: 'customer',
      email: 'john@acme.example', phone: '', tags: [], notes: '', source: '',
    });
    const other = app.store.create('contacts', {
      name: 'Jane Roe', company: 'Other', title: '', status: 'customer',
      email: '', phone: '', tags: [], notes: '', source: '',
    });
    const deal = app.store.create('deals', {
      title: 'Original', contactId: contact.id, value: 100, stage: 'won', priority: 'low',
      probability: 100, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: '2026-01-10T09:00:00.000Z',
    });
    app.store.create('deals', {
      title: 'Upsell seats', contactId: contact.id, value: 40000, stage: 'negotiation', priority: 'high',
      probability: 65, expectedCloseDate: '2026-11-02', notes: '', lostReason: '',
      stageChangedAt: '2026-10-11T09:00:00.000Z',
    });
    customer = app.store.create('customers', {
      contactId: contact.id, convertedDealId: deal.id, convertedAt: '2026-01-10T09:00:00.000Z',
      satisfactionRating: 4, notes: 'Prefers morning calls.',
    });
    app.store.create('customers', {
      contactId: other.id, convertedDealId: deal.id, convertedAt: '2026-02-02T09:00:00.000Z',
      satisfactionRating: null, notes: '',
    });
    app.store.create('orders', {
      customerId: customer.id, description: 'First purchase', amount: 100, status: 'completed', date: '2026-01-10', notes: '',
    });
    app.store.create('orders', {
      customerId: customer.id, description: 'Renewal', amount: 50, status: 'pending', date: '2026-10-20', notes: '',
    });
    app.store.create('orders', {
      customerId: customer.id, description: 'Cancelled seat', amount: 999, status: 'cancelled', date: '2026-10-21', notes: '',
    });
    app.store.create('activities', {
      type: 'note', contactId: contact.id, dealId: null, title: 'Onboarding note', description: 'Sent welcome pack',
      date: '2026-10-21T08:00:00.000Z', duration: null, outcome: '',
    });
  });

  it('lists customers with a sparkline and selects the first one', () => {
    const view = document.querySelector('[data-view="customers"]');
    expect(view.querySelector('h1').textContent).toMatch(/customer hq/i);
    const items = [...view.querySelectorAll('[data-customer-id]')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('canvas[data-sparkline]')).not.toBeNull();
    expect(items[0].textContent).toContain('John Doe');
    expect(items[0].textContent).toContain('Acme Corp');
    expect(items[0].textContent).toContain('₹150');
    expect(items[0].getAttribute('data-selected')).toBe('true');

    setValue(view.querySelector('[data-search]'), 'jane');
    expect(view.querySelectorAll('[data-customer-id]')).toHaveLength(1);
    expect(view.textContent).toContain('Jane Roe');
  });

  it('shows stat cards, order badges, and the open pipeline', () => {
    const view = document.querySelector('[data-view="customers"]');
    expect(view.textContent).toContain('Customer since');
    expect(view.textContent).toContain('Jan 10, 2026');
    expect(view.querySelector('[data-stat="revenue"]').textContent).toContain('₹150');
    expect(view.querySelector('[data-stat="orders"]').textContent).toContain('2');
    expect(view.querySelector('[data-stat="average"]').textContent).toContain('₹75');
    expect(view.querySelector('[data-stat="last-order"]').textContent).toContain('Oct 20, 2026');
    expect(view.querySelector('[data-rating="4"]').getAttribute('aria-pressed')).toBe('true');

    const table = view.querySelector('[data-tab-panel="orders"]');
    expect(table.textContent).toContain('First purchase');
    expect(table.querySelector('[data-status="completed"]').textContent).toMatch(/completed/i);
    expect(table.querySelector('[data-status="pending"]').textContent).toMatch(/pending/i);
    expect(table.querySelector('[data-status="cancelled"]').textContent).toMatch(/cancelled/i);

    click(view.querySelector('[data-tab="pipeline"]'));
    const pipeline = view.querySelector('[data-tab-panel="pipeline"]');
    expect(pipeline.textContent).toContain('Upsell seats');
    expect(pipeline.textContent).not.toContain('Original');
  });

  it('records a new order, a star rating, and debounced notes', () => {
    const view = document.querySelector('[data-view="customers"]');
    click([...view.querySelectorAll('button')].find((button) => button.textContent.trim() === 'New Order'));
    const dialog = document.querySelector('[role="dialog"]');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(dialog.querySelector('[data-error-for="description"]').textContent).toBe('Description is required');
    setValue(field('description', dialog), 'Extra seats');
    setValue(field('amount', dialog), '25');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(app.store.query('orders', (order) => order.description === 'Extra seats')).toHaveLength(1);

    click(document.querySelector('[data-rating="5"]'));
    expect(app.store.getById('customers', customer.id).satisfactionRating).toBe(5);

    click(document.querySelector('[data-tab="notes"]'));
    vi.useFakeTimers();
    const notes = document.querySelector('[data-tab-panel="notes"] textarea');
    setValue(notes, 'Call on **Fridays**.');
    notes.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(app.store.getById('customers', customer.id).notes).toBe('Call on **Fridays**.');
    expect(document.querySelector('[data-tab-panel="notes"]').innerHTML).toContain('<strong>Fridays</strong>');
    vi.useRealTimers();

    click(document.querySelector('[data-tab="activity"]'));
    expect(document.querySelector('[data-tab-panel="activity"]').textContent).toContain('Onboarding note');
  });
});
