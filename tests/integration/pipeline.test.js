import { beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';
import { backwardMoveMessage, conversionMessage } from '../../js/copy.js';

const STAGES = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];

function drag(card, column) {
  const dataTransfer = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
  column.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
  column.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
}

describe('the pipeline', () => {
  let app;
  let contact;
  let deal;

  beforeEach(() => {
    app = mount({ hash: '#/pipeline' });
    contact = app.store.create('contacts', {
      name: 'Ravi Krishnan', company: 'Tata Digital', title: 'CTO', status: 'prospect',
      email: 'ravi@tata.example', phone: '+91 90000 00000', tags: [], notes: '', source: 'Referral',
    });
    deal = app.store.create('deals', {
      title: 'Enterprise control tower rollout',
      contactId: contact.id,
      value: 250000,
      stage: 'negotiation',
      priority: 'critical',
      probability: 65,
      expectedCloseDate: '2026-10-30',
      notes: 'Waiting on procurement',
      lostReason: '',
      stageChangedAt: at(2026, 10, 7, 9).toISOString(),
    });
    app.store.create('activities', {
      type: 'email', contactId: contact.id, dealId: deal.id, title: 'Sent revised quote',
      description: '', date: at(2026, 10, 21, 7).toISOString(), duration: null, outcome: '',
    });
  });

  it('lays out the six stage columns and a deal card the way the mockup does', () => {
    const view = document.querySelector('[data-view="pipeline"]');
    expect(view.querySelector('h1').textContent).toMatch(/pipeline/i);
    expect([...view.querySelectorAll('[data-stage]')].map((column) => column.getAttribute('data-stage'))).toEqual(STAGES);
    expect(view.textContent).not.toMatch(/\bLOST\b/);

    const column = view.querySelector('[data-stage="negotiation"]');
    expect(column.textContent).toMatch(/NEGOTIATION/);
    expect(column.textContent).toContain('1');
    expect(column.textContent).toContain('₹2.5L');

    const card = column.querySelector(`[data-deal-id="${deal.id}"]`);
    expect(card.getAttribute('draggable')).toBe('true');
    expect(card.hasAttribute('data-swipe-actions')).toBe(true);
    expect(card.textContent).toContain('RK');
    expect(card.textContent).toContain('Enterprise control tower rollo…');
    expect(card.textContent).toContain('Tata Digital');
    expect(card.textContent).toContain('₹2,50,000');
    expect(card.querySelector('[data-age-tone="aging"]')).not.toBeNull();
    expect(card.textContent).toContain('2 hours ago');
    const dot = card.querySelector('[data-urgency="critical"]');
    expect(dot.classList.contains('pulse-critical')).toBe(true);

    expect(view.querySelector('[data-stage="won"]').getAttribute('data-highlight')).toBe('won');
    expect(view.querySelector('[data-stage-pager]').textContent).toMatch(/PROSPECT/);
    expect(view.querySelector('[data-stage-pager]').textContent).toMatch(/WON/);
  });

  it('filters by search, value, and priority, and shows removable chips', () => {
    app.store.create('deals', {
      title: 'Small pilot', contactId: contact.id, value: 10000, stage: 'prospect', priority: 'low',
      probability: 10, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 21, 9).toISOString(),
    });
    const view = document.querySelector('[data-view="pipeline"]');
    setValue(view.querySelector('[data-search]'), 'pilot');
    expect(view.querySelectorAll('[data-deal-id]')).toHaveLength(1);
    expect(view.querySelector('[data-filter-chip]').textContent).toMatch(/pilot/i);
    click(view.querySelector('[data-filter-chip] button'));
    expect(view.querySelectorAll('[data-deal-id]')).toHaveLength(2);

    setValue(field('minValue', view), '200000');
    setValue(view.querySelector('input[name="priority"][value="critical"]'), 'on');
    view.querySelector('input[name="priority"][value="critical"]').checked = true;
    view.querySelector('input[name="priority"][value="critical"]').dispatchEvent(new Event('change', { bubbles: true }));
    expect([...view.querySelectorAll('[data-deal-id]')].map((card) => card.getAttribute('data-deal-id'))).toEqual([deal.id]);
  });

  it('opens the deal drawer, logs nothing until a form is valid, and deletes after confirmation', () => {
    click(`[data-deal-id="${deal.id}"]`);
    const panel = document.querySelector('[data-panel="deal"]');
    expect(panel.textContent).toContain('ravi@tata.example');
    expect(panel.textContent).toContain('+91 90000 00000');
    expect(panel.textContent).toContain('Sent revised quote');
    for (const label of ['Log Call', 'Log Email', 'Log Meeting', 'Add Note', 'Edit', 'Delete']) {
      expect(panel.textContent).toContain(label);
    }

    click(panel.querySelector('button[data-action="delete"]'));
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog.textContent).toContain('Enterprise control tower rollout');
    expect(dialog.textContent).toMatch(/cannot be undone/i);
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel'));
    expect(app.store.getById('deals', deal.id)).not.toBeNull();

    click(document.querySelector('[data-panel="deal"] button[data-action="delete"]'));
    const again = document.querySelector('[role="alertdialog"]');
    click([...again.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Delete'));
    expect(app.store.getById('deals', deal.id)).toBeNull();
    expect(document.querySelector(`[data-deal-id="${deal.id}"]`)).toBeNull();
  });

  it('creates a deal from the header button and blocks an empty submit', () => {
    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'New Deal'));
    const dialog = document.querySelector('[role="dialog"]');
    for (const label of ['Title', 'Contact', 'Value', 'Stage', 'Expected Close Date', 'Priority', 'Notes']) {
      expect(dialog.textContent).toContain(label);
    }
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(dialog.querySelector('[data-error-for="title"]').textContent).toBe('Title is required');

    setValue(field('title', dialog), 'New logo');
    setValue(field('contact', dialog), contact.id);
    setValue(field('value', dialog), '80000');
    setValue(field('stage', dialog), 'prospect');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(app.store.query('deals', (item) => item.title === 'New logo')).toHaveLength(1);
    expect(document.querySelector('[data-tone="success"]')).not.toBeNull();
  });

  it('moves a card forward, asks before moving it backward, and collects a lost reason', () => {
    const card = document.querySelector(`[data-deal-id="${deal.id}"]`);
    drag(card, document.querySelector('[data-stage="closing"]'));
    expect(app.store.getById('deals', deal.id).stage).toBe('closing');
    expect(document.querySelector('[data-stage="closing"] [data-deal-id]')).not.toBeNull();

    drag(document.querySelector(`[data-deal-id="${deal.id}"]`), document.querySelector('[data-stage="qualified"]'));
    const confirm = document.querySelector('[role="alertdialog"]');
    expect(confirm.textContent).toContain(backwardMoveMessage('Qualified'));
    click([...confirm.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel'));
    expect(app.store.getById('deals', deal.id).stage).toBe('closing');

    drag(document.querySelector(`[data-deal-id="${deal.id}"]`), document.querySelector('[data-stage="qualified"]'));
    click([...document.querySelector('[role="alertdialog"]').querySelectorAll('button')].find((button) => button.textContent.trim() === 'Move'));
    expect(app.store.getById('deals', deal.id).stage).toBe('qualified');

    click(document.querySelector('[data-action="toggle-lost"]'));
    const lost = document.querySelector('[data-stage="lost"]');
    expect(lost).not.toBeNull();
    drag(document.querySelector(`[data-deal-id="${deal.id}"]`), lost);
    const reason = document.querySelector('[role="dialog"]');
    expect(reason.textContent).toMatch(/Why was this deal lost/);
    for (const suggestion of ['Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Other']) {
      expect(reason.textContent).toContain(suggestion);
    }
    click([...reason.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(reason.querySelector('[data-error-for="lostReason"]').textContent).toBe('Lost reason is required');
    setValue(field('lostReason', reason), 'Price');
    click([...reason.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(app.store.getById('deals', deal.id)).toMatchObject({ stage: 'lost', lostReason: 'Price' });
  });

  it('celebrates a win and converts the contact when the user says yes', () => {
    drag(document.querySelector(`[data-deal-id="${deal.id}"]`), document.querySelector('[data-stage="won"]'));
    expect(app.store.getById('deals', deal.id).stage).toBe('won');
    expect(document.querySelector('[data-celebration]')).not.toBeNull();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain(conversionMessage('Ravi Krishnan'));
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Yes'));
    expect(app.store.getById('contacts', contact.id).status).toBe('customer');
    expect(app.store.getAll('customers')).toHaveLength(1);
    expect(app.store.getAll('orders')[0]).toMatchObject({ description: 'Enterprise control tower rollout', amount: 250000, status: 'completed' });
  });
});
