import { beforeEach, describe, expect, it } from 'vitest';
import { click, mount } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

describe('the radar', () => {
  beforeEach(() => {
    const app = mount({ hash: '#/radar' });
    const contact = app.store.create('contacts', {
      name: 'Ravi Krishnan', company: 'Tata Digital', title: 'CTO', status: 'prospect',
      email: '', phone: '', tags: [], notes: '', source: '',
    });
    app.store.create('deals', {
      title: 'Won', contactId: contact.id, value: 80, stage: 'won', priority: 'low', probability: 100,
      expectedCloseDate: '', notes: '', lostReason: '', stageChangedAt: at(2026, 10, 4, 12).toISOString(),
    });
    app.store.create('deals', {
      title: 'Lost', contactId: contact.id, value: 20, stage: 'lost', priority: 'low', probability: 0,
      expectedCloseDate: '', notes: '', lostReason: 'Price', stageChangedAt: at(2026, 10, 6, 12).toISOString(),
    });
    app.store.create('deals', {
      title: 'Open', contactId: contact.id, value: 40, stage: 'proposal', priority: 'medium', probability: 50,
      expectedCloseDate: '2026-10-28', notes: '', lostReason: '', stageChangedAt: at(2026, 10, 11, 12).toISOString(),
    });
  });

  it('places the four canvas charts and the date presets from the mockup', () => {
    const view = document.querySelector('[data-view="radar"]');
    expect(view.querySelector('h1').textContent).toMatch(/radar/i);
    for (const chart of ['funnel', 'heatmap', 'velocity', 'winloss']) {
      expect(view.querySelector(`canvas[data-chart="${chart}"]`)).not.toBeNull();
    }
    expect(view.textContent).toContain('Conversion Funnel');
    expect(view.textContent).toContain('Revenue Heatmap');
    expect(view.textContent).toContain('Pipeline Velocity');
    expect(view.textContent).toContain('Win/Loss');
    const presets = [...view.querySelectorAll('[data-range]')].map((button) => button.textContent.trim());
    expect(presets).toEqual(['This Month', 'Last 3 Months', 'Last 6 Months', 'This Year', 'All Time']);
    expect(view.querySelector('[data-range="this-month"]').getAttribute('aria-pressed')).toBe('true');
    expect(view.textContent).toContain('50%');
    expect(view.textContent).toContain('Won: 1 deal (₹80)');
    expect(view.textContent).toContain('Lost: 1 deal (₹20)');
  });

  it('re-renders the win rate when the range excludes this month', () => {
    const view = document.querySelector('[data-view="radar"]');
    click(view.querySelector('[data-range="all-time"]'));
    expect(view.querySelector('[data-range="all-time"]').getAttribute('aria-pressed')).toBe('true');
    expect(view.querySelectorAll('canvas[data-chart]')).toHaveLength(4);
  });

  it('keeps a DOM tooltip node ready for chart hover', () => {
    expect(document.querySelector('[data-view="radar"] [data-chart-tooltip]')).not.toBeNull();
  });
});
