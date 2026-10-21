import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';
import { IMPORT_WARNING } from '../../js/copy.js';

describe('settings, import, and export', () => {
  let app;

  beforeEach(() => {
    app = mount({ hash: '#/settings' });
    app.store.create('contacts', {
      name: 'Keep me', status: 'prospect', email: '', phone: '', company: '', title: '', tags: [], notes: '', source: '',
    });
  });

  it('renames a stage, updates the greeting name, and changes the currency symbol', () => {
    const view = document.querySelector('[data-view="settings"]');
    setValue(field('userName', view), 'Puja');
    setValue(field('currency', view), '$');
    setValue(view.querySelector('[data-stage-id="prospect"]'), 'Lead');

    window.location.hash = '#/briefing';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('[data-view="briefing"]').textContent).toContain('Good morning, Puja');

    window.location.hash = '#/pipeline';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('[data-stage="prospect"]').textContent).toMatch(/LEAD/);
  });

  it('downloads a dated backup and replaces data only after the import warning', async () => {
    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Export All Data'));
    const link = document.querySelector('a[download]');
    expect(link.download).toBe('nexus-backup-2026-10-21.json');
    expect(JSON.parse(link.dataset.export).contacts).toHaveLength(1);

    const payload = {
      contacts: [{ id: 'imported', name: 'Imported', status: 'prospect', email: '', phone: '', company: '', title: '', tags: [], notes: '', source: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      deals: [], activities: [], customers: [], orders: [], tags: [],
      settings: { userName: 'there', currency: '₹', stages: [] },
      version: 1,
    };
    const input = document.querySelector('[data-field="import"]');
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('This file contains: 1 contact, 0 deals, 0 activities, 0 customers, 0 orders, 0 tags.');
      expect(document.body.textContent).toContain(IMPORT_WARNING);
    });
    expect(app.store.query('contacts', (contact) => contact.name === 'Keep me')).toHaveLength(1);

    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Replace all data'));
    expect(app.store.getById('contacts', 'imported').name).toBe('Imported');
    expect(app.store.query('contacts', (contact) => contact.name === 'Keep me')).toHaveLength(0);
  });

  it('resets the demo and clears everything only after two confirmations', () => {
    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Reset Demo Data'));
    click([...document.querySelector('[role="alertdialog"]').querySelectorAll('button')].find((button) => button.textContent.trim() === 'Reset'));
    expect(app.store.getAll('contacts').length).toBeGreaterThanOrEqual(6);

    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Clear All Data'));
    const first = document.querySelector('[role="alertdialog"]');
    expect(first.textContent).toMatch(/cannot be undone/i);
    click([...first.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Clear data'));
    const second = document.querySelector('[role="alertdialog"]');
    expect(second.textContent).toMatch(/Are you sure/);
    click([...second.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Clear data'));
    expect(app.store.getAll('contacts')).toEqual([]);
    expect(localStorage.getItem('nexus_data')).toBeTruthy();
  });

  it('creates a tag and refuses a duplicate name', () => {
    const view = document.querySelector('[data-view="settings"]');
    setValue(field('tagName', view), 'Partner');
    setValue(field('tagColor', view), '#10b981');
    click(view.querySelector('[data-action="add-tag"]'));
    expect(app.store.query('tags', (tag) => tag.name === 'Partner')).toHaveLength(1);

    setValue(field('tagName', view), 'partner');
    click(view.querySelector('[data-action="add-tag"]'));
    expect(view.querySelector('[data-error-for="tagName"]').textContent).toBe('Tag already exists');
  });
});
