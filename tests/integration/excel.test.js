import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootCloud } from '../../js/boot.js';
import { readXlsx, writeXlsx } from '../../js/xlsx.js';
import { fakeServer, settle } from '../helpers/fake-server.js';
import { click, mount, navigate } from '../helpers/mount.js';

const text = () => document.body.textContent.replace(/\s+/g, ' ');
const button = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === label);

const cells = (dialog, collection) => [...dialog.querySelectorAll(`[data-collection="${collection}"] td`)].map((cell) => cell.textContent.trim());

const contactColumns = ['ID', 'Name *', 'Email', 'Job title'].map((header) => ({ header, kind: header === 'ID' ? 'id' : 'text' }));

async function upload(rows, name = 'contacts.xlsx') {
  const bytes = await writeXlsx([{ name: 'Contacts', columns: contactColumns, rows }]);
  const input = document.querySelector('[data-field="excel-import"]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('[data-modal-type="excel-import"]')).not.toBeNull());
  return document.querySelector('[data-modal-type="excel-import"]');
}

async function downloaded(filename) {
  let link;
  await vi.waitFor(() => {
    link = document.querySelector(`a[download="${filename}"]`);
    expect(link?.workbook).toBeTruthy();
  });
  return readXlsx(link.workbook);
}

describe('Excel import and export on this device', () => {
  let app;

  function start() {
    app = mount({ hash: '#/settings' });
    return app.store.create('contacts', {
      name: 'Keep me', status: 'prospect', email: 'keep@example.com', phone: '', company: '', title: '', tags: [], notes: '', source: '',
    });
  }

  it('downloads a blank template and an export of the current records', async () => {
    start();
    click(button('Blank template'));
    const blank = await downloaded('nexus-import-template.xlsx');
    expect(blank.sheets.map((sheet) => sheet.name)).toEqual(['Instructions', 'Companies', 'Contacts', 'Deals', 'Deal people', 'Activities', 'Customers', 'Orders', 'Tags']);
    expect(blank.sheets.find((sheet) => sheet.name === 'Contacts').rows).toHaveLength(1);

    click(button('Export with records'));
    const full = await downloaded('nexus-data-2026-10-21.xlsx');
    const contacts = full.sheets.find((sheet) => sheet.name === 'Contacts').rows;
    expect(contacts).toHaveLength(2);
    expect(contacts[1]).toContain('Keep me');
    expect(text()).toContain('Exported 1 record to nexus-data-2026-10-21.xlsx');
  });

  it('previews new, updated, and problem rows, then saves only after confirming', async () => {
    const keep = start();
    const dialog = await upload([
      [keep.id, 'Keep me', 'keep@example.com', 'Head of Operations'],
      [null, 'Arjun Nair', 'arjun@example.com', 'CFO'],
      [null, 'Bad Email', 'not-an-email', ''],
    ]);
    expect(cells(dialog, 'contacts')).toEqual(['1', '1', '–']);
    expect(dialog.textContent).toContain('1 row has a problem and will be skipped');
    expect(dialog.textContent).toContain('Contacts row 4');
    expect(app.store.getAll('contacts')).toHaveLength(1);

    click(button('Import 2 changes'));
    expect(app.store.getById('contacts', keep.id).title).toBe('Head of Operations');
    expect(app.store.query('contacts', (contact) => contact.name === 'Arjun Nair')).toHaveLength(1);
    expect(document.querySelector('[data-modal-type="excel-import"]')).toBeNull();
    expect(text()).toContain('Imported 2 changes. 1 row with problems was skipped.');
  });

  it('says so when the file matches what is already saved, and rejects files that are not workbooks', async () => {
    const keep = start();
    const dialog = await upload([[keep.id, 'Keep me', 'keep@example.com', '']]);
    expect(dialog.textContent).toContain('nothing to import');
    expect(button('Close')).toBeTruthy();
    click(button('Close'));

    const input = document.querySelector('[data-field="excel-import"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['name,email'], 'contacts.csv', { type: 'text/csv' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(text()).toContain('This file is not an Excel workbook (.xlsx)'));
  });
});

describe('Excel import in a cloud workspace', () => {
  let booted = null;
  const clock = { now: () => new Date(2026, 9, 21, 9, 0, 0, 0) };
  const me = (role) => ({
    user: { id: 'usr_puja', email: 'puja@snilld.test', name: 'Puja Rao', picture: null },
    superAdmin: false,
    tenant: { id: 'tnt_snilld', name: 'Snilld', slug: 'snilld', role },
    memberships: [{ tenantId: 'tnt_snilld', name: 'Snilld', slug: 'snilld', role }],
  });

  async function boot(role) {
    const server = fakeServer({ me: me(role) });
    server.routes = { 'GET /api/members': () => ({ members: [], invitations: [] }) };
    server.seed('contacts', { id: 'c1', name: 'Kavya Menon', email: 'kavya@snilld.test', status: 'prospect', tags: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.location.hash = '#/settings';
    booted = await bootCloud({
      root: document.getElementById('app'),
      storage: localStorage,
      clock,
      api: server.api,
      location: { pathname: '/', search: '', hash: '#/settings' },
      history: { replaceState: vi.fn() },
      navigate: vi.fn(),
      reload: vi.fn(),
    });
    await booted.sync.ready;
    await settle();
    navigate('#/settings');
    return server;
  }

  afterEach(() => {
    booted?.sync?.stop();
    booted = null;
  });

  it('sends a large import to the server in batches and keeps the cache in step', async () => {
    const server = await boot('admin');
    const rows = [['c1', 'Kavya Menon', 'kavya@snilld.test', 'Head of Growth']];
    for (let i = 1; i <= 449; i += 1) rows.push([null, `Lead ${i}`, `lead${i}@example.com`, '']);
    const dialog = await upload(rows);
    expect(cells(dialog, 'contacts')).toEqual(['449', '1', '–']);

    const before = server.calls.filter((call) => call.path === '/api/changes').length;
    click(button('Import 450 changes'));
    await vi.waitFor(() => expect(text()).toContain('Imported 450 changes for the whole team.'));
    const batches = server.calls.filter((call) => call.path === '/api/changes').slice(before);
    expect(batches.map((call) => call.body.ops.length)).toEqual([200, 200, 50]);
    expect(batches[0].body.ops.find((op) => op.id === 'c1').baseVersion).toBe(1);
    expect(server.live('contacts')).toHaveLength(450);
    expect(server.live('contacts').find((contact) => contact.id === 'c1').title).toBe('Head of Growth');
    expect(booted.store.getAll('contacts')).toHaveLength(450);
    expect(booted.sync.pendingCount()).toBe(0);
  });

  it('lets members download Excel files but not import them', async () => {
    await boot('member');
    expect(button('Blank template')).toBeTruthy();
    expect(button('Export with records')).toBeTruthy();
    expect(document.querySelector('[data-field="excel-import"]')).toBeNull();
    expect(text()).toContain('Only owners and admins can import from Excel.');
  });
});
