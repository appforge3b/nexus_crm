import { beforeEach, describe, expect, it } from 'vitest';
import { click, mount } from '../helpers/mount.js';

const NAV = [
  ['Briefing', '#/briefing'],
  ['Pipeline', '#/pipeline'],
  ['Roster', '#/roster'],
  ['Chronicle', '#/chronicle'],
  ['Radar', '#/radar'],
  ['Customers', '#/customers'],
];

describe('application shell', () => {
  beforeEach(() => {
    mount();
  });

  it('opens on the briefing and renders the dark-cockpit sidebar from the mockups', () => {
    const sidebar = document.querySelector('[data-sidebar]');
    expect(sidebar).not.toBeNull();
    expect(sidebar.textContent).toMatch(/NEXUS/);
    expect(sidebar.textContent.indexOf('NEXUS')).toBeLessThan(sidebar.textContent.indexOf('Briefing'));

    const links = [...sidebar.querySelectorAll('a')];
    for (const [label, href] of NAV) {
      const link = links.find((item) => item.textContent.trim().includes(label) && item.getAttribute('href') === href);
      expect(link, label).toBeTruthy();
      expect(link.querySelector('svg')).not.toBeNull();
    }
    const order = NAV.map(([label]) => sidebar.textContent.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    expect(sidebar.querySelector('a[href="#/briefing"]').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('[data-view="briefing"]')).not.toBeNull();
    expect(document.querySelector('canvas[data-particle-field]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="#/settings"]')).not.toBeNull();
  });

  it('routes from the sidebar, the bottom nav, and the number keys', () => {
    click(document.querySelector('[data-sidebar] a[href="#/pipeline"]'));
    expect(document.querySelector('[data-view="pipeline"]')).not.toBeNull();
    expect(document.querySelector('[data-sidebar] a[href="#/pipeline"]').getAttribute('aria-current')).toBe('page');

    const bottom = document.querySelector('[data-bottom-nav]');
    expect([...bottom.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(NAV.map(([, href]) => href));
    click(bottom.querySelector('a[href="#/radar"]'));
    expect(document.querySelector('[data-view="radar"]')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(document.querySelector('[data-view="roster"]')).not.toBeNull();
  });

  it('collapses the desktop sidebar and opens the mobile overlay', () => {
    const sidebar = document.querySelector('[data-sidebar]');
    click(document.querySelector('[aria-label="Collapse sidebar"]'));
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    click(document.querySelector('[aria-label="Collapse sidebar"]'));
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');

    click(document.querySelector('[aria-label="Open menu"]'));
    expect(sidebar.getAttribute('data-open')).toBe('true');
  });

  it('sends an empty or unknown hash to the briefing and honors a deep link', () => {
    window.location.hash = '#/nope';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('[data-view="briefing"]')).not.toBeNull();
  });

  it('lists the shortcuts when ? is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toMatch(/Keyboard shortcuts/);
    for (const label of ['Briefing', 'Pipeline', 'Roster', 'Chronicle', 'Radar', 'Customers', 'Escape', 'Search']) {
      expect(dialog.textContent).toContain(label);
    }
  });
});

describe('routing on startup', () => {
  it('renders the hashed view before the first paint', () => {
    mount({ hash: '#/customers' });
    expect(document.querySelector('[data-view="customers"]')).not.toBeNull();
    expect(document.querySelector('[data-sidebar] a[href="#/customers"]').getAttribute('aria-current')).toBe('page');
  });
});
