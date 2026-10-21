import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';
import { at, daysBefore } from '../helpers/time.js';

describe('the roster', () => {
  let app;
  let contact;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    app = mount({ hash: '#/roster' });
    const now = at(2026, 10, 21, 9);
    const tags = ['Enterprise', 'Tech', 'Decision Maker', 'Finance', 'Champion'].map((name) => (
      app.store.create('tags', { name, color: '#6366f1' })
    ));
    contact = app.store.create('contacts', {
      name: 'Alisha Miller',
      email: 'alisha@techcorp.example',
      phone: '+91 98888 11111',
      company: 'TechCorp',
      title: 'Head of Sales',
      tags: tags.map((tag) => tag.id),
      notes: 'Knows the buying committee.',
      status: 'prospect',
      source: 'Conference',
    });
    app.store.create('deals', {
      title: 'Platform', contactId: contact.id, value: 120000, stage: 'proposal', priority: 'high',
      probability: 50, expectedCloseDate: '2026-11-01', notes: '', lostReason: '',
      stageChangedAt: now.toISOString(),
    });
    app.store.create('deals', {
      title: 'Old win', contactId: contact.id, value: 450000, stage: 'won', priority: 'low',
      probability: 100, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 8, 1, 9).toISOString(),
    });
    app.store.create('activities', {
      type: 'meeting', contactId: contact.id, dealId: null, title: 'Quarterly review', description: 'Budget confirmed',
      date: daysBefore(now, 1).toISOString(), duration: 45, outcome: '',
    });
    app.store.create('contacts', {
      name: 'Inactive Ian', email: 'ian@old.example', phone: '', company: 'Old Co', title: '',
      tags: [], notes: '', status: 'inactive', source: '',
    });
  });

  it('renders a contact card with strength, value, and at most three tags', () => {
    const view = document.querySelector('[data-view="roster"]');
    expect(view.querySelector('h1').textContent).toMatch(/contacts/i);
    expect(view.querySelector('[data-search]').getAttribute('placeholder')).toBe('Search contacts...');
    const tabs = [...view.querySelectorAll('[data-status-tab]')].map((tab) => tab.textContent.replace(/\s+/g, ' ').trim());
    expect(tabs[0]).toMatch(/All\s+2/);
    expect(tabs[1]).toMatch(/Prospects\s+1/);
    expect(tabs[2]).toMatch(/Customers\s+0/);
    expect(tabs[3]).toMatch(/Inactive\s+1/);

    const card = view.querySelector(`[data-contact-id="${contact.id}"]`);
    expect(card.textContent).toContain('AM');
    expect(card.textContent).toContain('Alisha Miller');
    expect(card.textContent).toContain('Head of Sales at TechCorp');
    expect(card.textContent).toContain('Relationship Strength');
    expect(card.querySelector('[data-strength]').getAttribute('data-strength')).toBe('50');
    expect(card.textContent).toContain('1 active deal (₹1.2L)');
    expect(card.textContent).toContain('yesterday');
    expect(card.textContent).toContain('Lifetime: ₹4.5L');
    expect(card.querySelectorAll('[data-tag]')).toHaveLength(3);
    expect(card.textContent).toContain('+2');
  });

  it('debounces search and switches status tabs', () => {
    vi.useFakeTimers();
    const view = document.querySelector('[data-view="roster"]');
    setValue(view.querySelector('[data-search]'), 'ian');
    expect(view.querySelectorAll('[data-contact-id]')).toHaveLength(2);
    vi.advanceTimersByTime(300);
    expect(view.querySelectorAll('[data-contact-id]')).toHaveLength(1);
    expect(view.textContent).toContain('Inactive Ian');

    setValue(view.querySelector('[data-search]'), '');
    vi.advanceTimersByTime(300);
    click(view.querySelector('[data-status-tab="inactive"]'));
    expect([...view.querySelectorAll('[data-contact-id]')].map((card) => card.textContent)).toEqual([
      expect.stringContaining('Inactive Ian'),
    ]);
    vi.useRealTimers();
  });

  it('expands a contact and refuses to delete associated deals until confirmed', () => {
    click(`[data-contact-id="${contact.id}"]`);
    const panel = document.querySelector('[data-panel="contact"]');
    expect(panel.textContent).toContain('alisha@techcorp.example');
    expect(panel.textContent).toContain('Quarterly review');
    expect(panel.textContent).toContain('Platform');
    for (const label of ['Log Call', 'Log Email', 'Schedule Meeting', 'Add Note', 'Edit', 'Delete']) {
      expect(panel.textContent).toContain(label);
    }

    click(panel.querySelector('button[data-action="delete"]'));
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog.textContent).toMatch(/2 associated deals/);
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Delete'));
    expect(app.store.getById('contacts', contact.id)).toBeNull();
    expect(app.store.query('deals', (item) => item.contactId === contact.id)).toHaveLength(0);
  });

  it('validates and creates a contact from Add Contact', () => {
    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Add Contact'));
    const dialog = document.querySelector('[role="dialog"]');
    for (const label of ['Name', 'Email', 'Phone', 'Company', 'Title', 'Tags', 'Source', 'Notes']) {
      expect(dialog.textContent).toContain(label);
    }
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(dialog.querySelector('[data-error-for="name"]').textContent).toBe('Name is required');
    setValue(field('name', dialog), 'New Person');
    setValue(field('email', dialog), 'new@person.example');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(app.store.query('contacts', (item) => item.name === 'New Person')).toHaveLength(1);
  });
});
