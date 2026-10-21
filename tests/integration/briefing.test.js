import { beforeEach, describe, expect, it } from 'vitest';
import { click, mount } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

describe('the briefing', () => {
  let app;

  beforeEach(() => {
    app = mount();
  });

  it('greets by the time of day and shows the three KPI cards from the mockup', () => {
    const view = document.querySelector('[data-view="briefing"]');
    expect(view.textContent).toContain('Good morning, there');
    expect(view.textContent).toContain('Wednesday, October 21, 2026');
    expect(view.textContent).toContain('You have no deals closing this week.');

    const labels = [...view.querySelectorAll('[data-region="kpis"] [data-kpi]')].map((card) => card.getAttribute('data-kpi'));
    expect(labels).toEqual(['pipeline', 'won', 'conversion']);
    expect(view.textContent).toContain('Pipeline Value');
    expect(view.textContent).toContain('Won This Month');
    expect(view.textContent).toContain('Conversion Rate');
    expect(view.textContent).toContain('this month');
    expect(view.querySelector('canvas[data-chart="forecast"]')).not.toBeNull();
    expect(view.querySelector('[data-region="priorities"]').textContent).toContain("Today's Priorities");
    expect(view.querySelector('[data-region="priorities"]').textContent).toContain('Nothing urgent right now.');
    expect(view.querySelector('[data-region="activity-feed"]').textContent).toContain('Activity Feed');
    expect(view.querySelector('[data-region="activity-feed"]').textContent).toContain('No activity yet.');
  });

  it('uses the profile name and renders live pipeline, priority, and feed data', () => {
    app.store.updateSettings({ userName: 'Puja' });
    const contact = app.store.create('contacts', {
      name: 'Ravi Krishnan', company: 'Tata Digital', title: 'CTO', status: 'prospect', email: 'ravi@tata.example', phone: '', tags: [], notes: '', source: '',
    });
    const deal = app.store.create('deals', {
      title: 'Control tower', contactId: contact.id, value: 1240000, stage: 'closing', priority: 'critical',
      probability: 85, expectedCloseDate: '2026-10-22', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 20, 9).toISOString(),
    });
    app.store.create('deals', {
      title: 'Last month win', contactId: contact.id, value: 100, stage: 'won', priority: 'low',
      probability: 100, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 9, 12, 9).toISOString(),
    });
    app.store.create('deals', {
      title: 'This month win', contactId: contact.id, value: 810000, stage: 'won', priority: 'low',
      probability: 100, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 4, 9).toISOString(),
    });
    const activity = app.store.create('activities', {
      type: 'call', contactId: contact.id, dealId: deal.id, title: 'Discovery call', description: '',
      date: at(2026, 10, 21, 8).toISOString(), duration: 20, outcome: '',
    });

    const view = document.querySelector('[data-view="briefing"]');
    expect(view.textContent).toContain('Good morning, Puja');
    expect(view.textContent).toContain('You have 1 hot deal worth ₹12.4L closing this week.');
    expect(view.querySelector('[data-kpi="pipeline"]').textContent).toContain('₹12.4L');
    expect(view.querySelector('[data-kpi="won"]').textContent).toContain('₹8.1L');
    expect(view.querySelector('[data-kpi="won"]').textContent).toMatch(/New|▲/);
    expect(view.querySelector('[data-priority-id]').textContent).toContain('Ravi Krishnan');
    expect(view.querySelector('[data-priority-id]').textContent).toContain('Closing tomorrow');
    expect(view.querySelector('[data-urgency="critical"]').classList.contains('pulse-critical')).toBe(true);
    expect(view.querySelector('[data-region="activity-feed"]').textContent).toContain('Discovery call');
    expect(view.querySelector('[data-region="activity-feed"]').textContent).toContain('1 hour ago');

    click(`[data-priority-id="${deal.id}"]`);
    expect(document.querySelector('[data-view="pipeline"]')).not.toBeNull();
    expect(document.querySelector('[data-panel="deal"]').textContent).toContain('Control tower');

    window.location.hash = '#/briefing';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    click(`[data-activity-id="${activity.id}"]`);
    expect(document.querySelector('[data-view="chronicle"]')).not.toBeNull();
    expect(window.location.hash).toContain(`contact=${contact.id}`);
  });
});
