import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

class FakeObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger() {
    this.callback([{ isIntersecting: true }]);
  }
}

describe('the chronicle', () => {
  let app;
  let contact;
  let other;
  let originalObserver;

  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver;
  });

  beforeEach(() => {
    originalObserver = globalThis.IntersectionObserver;
    FakeObserver.instances = [];
    globalThis.IntersectionObserver = FakeObserver;
    app = mount({ hash: '#/chronicle' });
    contact = app.store.create('contacts', {
      name: 'Priya Shah', company: 'Northwind', title: 'CFO', status: 'active',
      email: 'priya@northwind.example', phone: '', tags: [], notes: '', source: '',
    });
    other = app.store.create('contacts', {
      name: 'Ravi Krishnan', company: 'Tata Digital', title: 'CTO', status: 'prospect',
      email: '', phone: '', tags: [], notes: '', source: '',
    });
    const deal = app.store.create('deals', {
      title: 'Retainer', contactId: contact.id, value: 1000, stage: 'proposal', priority: 'medium',
      probability: 50, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 21, 9).toISOString(),
    });
    for (let index = 0; index < 45; index += 1) {
      const day = new Date(2026, 9, 21, 8, index, 0, 0);
      app.store.create('activities', {
        type: index % 4 === 0 ? 'call' : index % 4 === 1 ? 'email' : index % 4 === 2 ? 'meeting' : 'note',
        contactId: index % 5 === 0 ? other.id : contact.id,
        dealId: index % 2 === 0 ? deal.id : null,
        title: `Activity ${index}`,
        description: `Details for activity ${index} that run long enough to clamp.`,
        date: day.toISOString(),
        duration: index % 4 === 0 || index % 4 === 2 ? 30 : null,
        outcome: '',
      });
    }
  });

  it('shows the four quick-log actions and an alternating timeline of the newest 20', () => {
    const view = document.querySelector('[data-view="chronicle"]');
    expect(view.querySelector('h1').textContent).toMatch(/chronicle/i);
    const actions = [...view.querySelectorAll('[data-log]')].map((button) => button.getAttribute('data-log'));
    expect(actions).toEqual(['call', 'email', 'meeting', 'note']);
    expect(view.textContent).toContain('Log Call');
    expect(view.textContent).toContain('Log Email');
    expect(view.textContent).toContain('Log Meeting');
    expect(view.textContent).toContain('Add Note');

    const entries = [...view.querySelectorAll('[data-activity-id]')];
    expect(entries).toHaveLength(20);
    expect(entries[0].textContent).toContain('Activity 44');
    expect(entries.map((entry) => entry.getAttribute('data-side'))).toEqual(
      Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? 'left' : 'right')),
    );
    expect(view.querySelector('[data-timeline]')).not.toBeNull();
    expect(view.querySelector('[data-timeline-sentinel]')).not.toBeNull();
    expect(entries[0].querySelector('[aria-label="Edit activity"]')).not.toBeNull();
    expect(entries[0].querySelector('[aria-label="Delete activity"]')).not.toBeNull();
    expect(view.textContent).toContain('Today');
  });

  it('loads the next pages when the sentinel intersects', () => {
    const view = document.querySelector('[data-view="chronicle"]');
    FakeObserver.instances.at(-1).trigger();
    expect(view.querySelectorAll('[data-activity-id]')).toHaveLength(40);
    FakeObserver.instances.at(-1).trigger();
    expect(view.querySelectorAll('[data-activity-id]')).toHaveLength(45);
  });

  it('filters by type and opens a call form that requires a contact and a title', () => {
    const view = document.querySelector('[data-view="chronicle"]');
    click(view.querySelector('[data-filter-type="call"]'));
    const visible = [...view.querySelectorAll('[data-activity-id]')];
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((entry) => entry.getAttribute('data-type') === 'call')).toBe(true);

    click(view.querySelector('[data-log="email"]'));
    let dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('[data-field="duration"]')).toBeNull();
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel'));

    click(view.querySelector('[data-log="call"]'));
    dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('[data-field="duration"]')).not.toBeNull();
    for (const label of ['Contact', 'Deal', 'Title', 'Description', 'Date', 'Outcome']) {
      expect(dialog.textContent).toContain(label);
    }
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(dialog.querySelector('[data-error-for="contact"]').textContent).toBe('Contact is required');
    expect(dialog.querySelector('[data-error-for="title"]').textContent).toBe('Title is required');

    setValue(field('contact', dialog), contact.id);
    setValue(field('title', dialog), 'Follow-up call');
    setValue(field('duration', dialog), '15');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    expect(app.store.query('activities', (item) => item.title === 'Follow-up call')).toHaveLength(1);
    expect(document.querySelector('[data-tone="success"]')).not.toBeNull();
  });

  it('navigates to the contact and the deal from a timeline entry', () => {
    const entry = document.querySelector('[data-activity-id]');
    click(entry.querySelector('[data-link="contact"]'));
    expect(document.querySelector('[data-view="roster"]')).not.toBeNull();
    expect(document.querySelector('[data-panel="contact"]')).not.toBeNull();

    window.location.hash = '#/chronicle';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const linked = [...document.querySelectorAll('[data-activity-id]')].find((item) => item.querySelector('[data-link="deal"]'));
    click(linked.querySelector('[data-link="deal"]'));
    expect(document.querySelector('[data-view="pipeline"]')).not.toBeNull();
    expect(document.querySelector('[data-panel="deal"]')).not.toBeNull();
  });
});
