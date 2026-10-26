import { beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, navigate, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

function dialog() {
  return document.querySelector('.overlay-host [role="dialog"]');
}

function follows(first, second) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('next steps and the two-way chronicle', () => {
  let app;
  let priya;
  let deal;

  beforeEach(() => {
    app = mount({ hash: '#/chronicle' });
    priya = app.store.create('contacts', {
      name: 'Priya Shah', company: 'Northwind', title: 'CFO', status: 'active',
      email: 'priya@northwind.example', phone: '+44 7700 900123', tags: [], notes: '', source: '',
    });
    deal = app.store.create('deals', {
      title: 'Northwind retainer', contactId: priya.id, value: 250000, stage: 'proposal', priority: 'high',
      probability: 50, expectedCloseDate: '', notes: '', lostReason: '', stageChangedAt: at(2026, 10, 19, 9).toISOString(),
    });
    app.store.create('activities', {
      type: 'call', status: 'done', contactId: priya.id, dealId: deal.id, title: 'Discovery call',
      description: '', date: at(2026, 10, 20, 15).toISOString(), duration: 30, outcome: '',
    });
  });

  it('plans a step from the Chronicle and shows it above the Today anchor, with history below', () => {
    click('.plan-bar [data-action="plan-step"]');
    expect(dialog().getAttribute('data-modal-type')).toBe('plan');
    click(dialog().querySelector('[data-action="pick-title"][data-title="Present GTM deck"]'));
    click(dialog().querySelector('[data-action="pick-when"][data-when="next-week"]'));
    setValue(field('contact', dialog()), priya.id);
    setValue(field('deal', dialog()), deal.id);
    click(dialog().querySelector('[data-action="save-modal"]'));

    const step = app.store.getAll('activities').find((item) => item.title === 'Present GTM deck');
    expect(step.status).toBe('planned');
    expect(new Date(step.date)).toEqual(at(2026, 10, 26, 10));
    expect(document.querySelector('[role="status"]').textContent).toContain('Planned for Mon 26 Oct');

    const view = document.querySelector('[data-view="chronicle"]');
    const anchor = view.querySelector('[data-today-anchor]');
    const planned = view.querySelector(`[data-activity-id="${step.id}"]`);
    const past = [...view.querySelectorAll('[data-stream="done"]')].find((entry) => entry.textContent.includes('Discovery call'));
    expect(planned.dataset.stream).toBe('upcoming');
    expect(planned.classList.contains('is-planned')).toBe(true);
    expect(follows(planned, anchor)).toBe(true);
    expect(follows(anchor, past)).toBe(true);
    expect(anchor.querySelector('[data-action="scroll-upcoming"]').textContent).toContain('1 upcoming step');

    click(view.querySelector('[data-chron-status="done"]'));
    expect(view.querySelector(`[data-activity-id="${step.id}"]`)).toBeNull();
    click(view.querySelector('[data-chron-status="upcoming"]'));
    expect(view.querySelector('[data-stream="done"]')).toBeNull();
  });

  it('keeps overdue steps just below Today, reschedules with undo, and marks them done', () => {
    const overdue = app.store.create('activities', {
      type: 'meeting', status: 'planned', contactId: priya.id, dealId: deal.id, title: 'Send revised pricing',
      description: '', date: at(2026, 10, 19, 11).toISOString(), duration: null, outcome: '',
    });
    const view = document.querySelector('[data-view="chronicle"]');
    const entry = () => view.querySelector(`[data-activity-id="${overdue.id}"]`);
    expect(entry().dataset.stream).toBe('today');
    expect(entry().dataset.due).toBe('overdue');
    expect(view.querySelector('[data-label="overdue"]').textContent).toContain('Overdue · 1');

    click(entry().querySelector('[data-action="reschedule"][data-days="1"]'));
    expect(new Date(app.store.getById('activities', overdue.id).date)).toEqual(at(2026, 10, 22, 11));
    expect(entry().dataset.stream).toBe('upcoming');
    click('[data-action="toast-action"]');
    expect(new Date(app.store.getById('activities', overdue.id).date)).toEqual(at(2026, 10, 19, 11));

    click(entry().querySelector('[data-action="step-done"]'));
    expect(dialog().getAttribute('data-modal-type')).toBe('complete');
    setValue(field('outcome', dialog()), 'Pricing accepted');
    click(dialog().querySelector('[data-action="save-modal"]'));
    const done = app.store.getById('activities', overdue.id);
    expect(done.status).toBe('done');
    expect(done.outcome).toBe('Pricing accepted');
    expect(done.completedAt).toBe(at(2026, 10, 21, 9).toISOString());
    expect(dialog().getAttribute('data-modal-type')).toBe('plan');
    expect(field('contact', dialog()).value).toBe(priya.id);
    expect(field('deal', dialog()).value).toBe(deal.id);
  });

  it('surfaces next steps on deal cards, in the deal drawer, and on the Briefing', () => {
    const step = app.store.create('activities', {
      type: 'call', status: 'planned', contactId: priya.id, dealId: deal.id, title: 'Follow up on legal',
      description: '', date: at(2026, 10, 20, 16).toISOString(), duration: null, outcome: '',
    });
    navigate('#/pipeline');
    const chip = document.querySelector(`[data-deal-id="${deal.id}"] .next-chip`);
    expect(chip.textContent).toContain('Follow up on legal');
    expect(chip.dataset.due).toBe('overdue');
    click(chip);
    expect(dialog().getAttribute('data-modal-type')).toBe('plan');
    expect(field('title', dialog()).value).toBe('Follow up on legal');
    click(dialog().querySelector('[data-action="cancel-modal"]'));

    navigate(`#/pipeline?deal=${deal.id}`);
    const steps = document.querySelector('[data-panel] [data-region="next-steps"]');
    expect(steps.querySelector(`[data-step-id="${step.id}"]`)).not.toBeNull();

    navigate('#/briefing');
    const agenda = document.querySelector('[data-region="agenda"]');
    expect(agenda.textContent).toContain('Follow up on legal');
    expect(document.querySelector(`[data-priority-id="${deal.id}"]`).getAttribute('title')).toContain('Follow-up overdue: Follow up on legal');
  });

  it('asks for a title, contact and date before planning', () => {
    click('.plan-bar [data-action="plan-step"]');
    setValue(field('date', dialog()), '');
    click(dialog().querySelector('[data-action="save-modal"]'));
    const errors = [...dialog().querySelectorAll('.field-error')].map((node) => node.textContent);
    expect(errors).toEqual(expect.arrayContaining(['Title is required', 'Contact is required', 'Date is required']));
    expect(app.store.getAll('activities')).toHaveLength(1);
  });
});
