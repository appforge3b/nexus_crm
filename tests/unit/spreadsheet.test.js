import { describe, expect, it } from 'vitest';
import { readXlsx, writeXlsx, toSerial, fromSerial } from '../../js/xlsx.js';
import { parseAmount, parseDate, planSpreadsheetImport, workbookSheets } from '../../js/spreadsheet.js';
import { seedDemoData } from '../../js/seed.js';
import { emptyDocument } from '../../js/store.js';

const now = new Date(2026, 9, 21, 9, 0, 0);

function ids() {
  let n = 0;
  return () => `new-${++n}`;
}

/** A workbook as readXlsx returns it, from { sheetName: [headerRow, ...rows] }. */
const book = (sheets) => ({ sheets: Object.entries(sheets).map(([name, rows]) => ({ name, rows })) });

describe('xlsx', () => {
  it('round-trips text, numbers, dates and sheet names, compressed', async () => {
    const bytes = await writeXlsx([
      { name: 'Notes', notes: true, rows: [[{ v: 'Title', s: 'title' }], ['a', '', 'long text']] },
      {
        name: 'Deal people',
        columns: [
          { header: 'Name *', kind: 'text', prompt: 'Who' },
          { header: 'Value', kind: 'number' },
          { header: 'When', kind: 'datetime' },
          { header: 'Day', kind: 'date', list: ['x', 'y'] },
        ],
        rows: [['Ananya & "Co" <ltd>', 420000, '2026-10-21T08:30:00.000Z', '2026-12-31'], ['Ravi', 0.5, '', '']],
      },
    ], { now });
    expect(bytes[0]).toBe(0x50);
    const { sheets } = await readXlsx(bytes);
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Notes', 'Deal people']);
    const [header, first, second] = sheets[1].rows;
    expect(header).toEqual(['Name *', 'Value', 'When', 'Day']);
    expect(first[0]).toBe('Ananya & "Co" <ltd>');
    expect(first[1]).toBe(420000);
    expect(first[2]).toBeInstanceOf(Date);
    expect(first[2].toISOString()).toBe('2026-10-21T08:30:00.000Z');
    expect(first[3].getFullYear()).toBe(2026);
    expect(first[3].getDate()).toBe(31);
    expect(second.slice(0, 2)).toEqual(['Ravi', 0.5]);
  });

  it('converts Excel serial numbers in local time', () => {
    const date = new Date(2026, 0, 2, 14, 30);
    expect(fromSerial(toSerial(date)).getTime()).toBe(date.getTime());
    expect(toSerial(new Date(1900, 0, 1))).toBe(2);
  });

  it('rejects files that are not workbooks', async () => {
    await expect(readXlsx(new TextEncoder().encode('name,email\n'))).rejects.toThrow('not an Excel workbook');
  });
});

describe('values people type', () => {
  it('reads Indian and plain amounts', () => {
    expect(parseAmount('₹4,20,000')).toBe(420000);
    expect(parseAmount('4.2L')).toBe(420000);
    expect(parseAmount('1.5 Cr')).toBe(15000000);
    expect(parseAmount('12k')).toBe(12000);
    expect(parseAmount(99)).toBe(99);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('lots')).toBeNaN();
  });

  it('reads ISO and day-first dates', () => {
    expect(parseDate('2026-10-21').getDate()).toBe(21);
    const dayFirst = parseDate('05/11/2026 2:30 pm');
    expect([dayFirst.getDate(), dayFirst.getMonth(), dayFirst.getHours(), dayFirst.getMinutes()]).toEqual([5, 10, 14, 30]);
    expect(parseDate('31/02/2026')).toBeNaN();
    expect(parseDate('')).toBeNull();
  });
});

describe('planning a spreadsheet import', () => {
  it('creates linked records from a blank template, making companies and tags on the way', () => {
    const plan = planSpreadsheetImport(book({
      Contacts: [
        ['ID', 'Name *', 'Email', 'Company', 'Status', 'Tags'],
        [null, 'Priya Sharma', 'priya@helios.example', 'Helios Bank', 'Active', 'Enterprise, Finance'],
        [null, 'Rohan Desai', 'rohan@helios.example', 'helios bank', '', 'finance'],
      ],
      Deals: [
        ['ID', 'Title *', 'Primary contact *', 'Value *', 'Stage', 'Expected close'],
        [null, 'Core banking', 'priya@helios.example', '8.5L', 'Negotiation', '31/12/2026'],
      ],
      'Deal people': [
        ['Deal *', 'Contact *', 'Role'],
        ['Core banking', 'Rohan Desai', 'Finance'],
      ],
      Activities: [
        ['Type *', 'Date & time *', 'Contact *', 'Deal', 'Title *'],
        ['Meeting', '22/10/2026 11:00', 'Priya Sharma', 'Core banking', 'Present the GTM deck'],
      ],
    }), emptyDocument(), { now, newId: ids() });

    expect(plan.problems).toEqual([]);
    expect(plan.counts.companies.created).toBe(1);
    expect(plan.counts.tags.created).toBe(2);
    expect(plan.counts.contacts.created).toBe(2);
    const data = (collection) => plan.ops.filter((op) => op.collection === collection).map((op) => op.data);
    const [priya, rohan] = data('contacts');
    expect(priya.companyId).toBe(rohan.companyId);
    expect(priya.company).toBe('Helios Bank');
    expect(rohan.tags).toEqual([priya.tags[1]]);
    const [deal] = data('deals');
    expect(deal).toMatchObject({ value: 850000, stage: 'negotiation', probability: 65, expectedCloseDate: '2026-12-31', contactId: priya.id, companyId: priya.companyId });
    expect(deal.stakeholders).toEqual([{ contactId: priya.id, role: '' }, { contactId: rohan.id, role: 'Finance' }]);
    const [meeting] = data('activities');
    expect(meeting).toMatchObject({ type: 'meeting', status: 'planned', dealId: deal.id, contactId: priya.id });
  });

  it('updates by ID, matches rows without one, and leaves untouched records alone', () => {
    const state = seedDemoData(now);
    const ravi = state.contacts.find((c) => c.name === 'Ravi Krishnan');
    const priya = state.contacts.find((c) => c.name === 'Priya Sharma');
    const plan = planSpreadsheetImport(book({
      Contacts: [
        ['ID', 'Name', 'Email', 'Job title'],
        [ravi.id, 'Ravi Krishnan', ravi.email, 'Chief Technology Officer'],
        [null, 'Priya S.', priya.email, priya.title],
        [state.contacts[2].id, state.contacts[2].name, state.contacts[2].email, state.contacts[2].title],
      ],
    }), state, { now, newId: ids() });
    expect(plan.problems).toEqual([]);
    expect(plan.counts.contacts).toEqual({ created: 0, updated: 2, unchanged: 1 });
    const updated = plan.ops.find((op) => op.id === ravi.id).data;
    expect(updated.title).toBe('Chief Technology Officer');
    expect(updated.phone).toBe(ravi.phone);
    expect(updated.createdAt).toBe(ravi.createdAt);
    expect(plan.ops.find((op) => op.id === priya.id).data.name).toBe('Priya S.');
  });

  it('re-imports its own export without changing anything, even though Excel drops milliseconds', async () => {
    const seededAt = new Date(now.getTime() + 437);
    const state = seedDemoData(seededAt);
    const bytes = await writeXlsx(workbookSheets(state, { now }), { now });
    const plan = planSpreadsheetImport(await readXlsx(bytes), state, { now, newId: ids() });
    expect(plan.problems).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.ops).toEqual([]);
    expect(plan.counts.contacts.unchanged).toBe(state.contacts.length);
    expect(plan.counts.orders.unchanged).toBe(state.orders.length);
  });

  it('moves a deal to a new stage with history, and reports bad rows without half-saving them', () => {
    const state = seedDemoData(now);
    const deal = state.deals.find((d) => d.stage === 'proposal');
    const plan = planSpreadsheetImport(book({
      Deals: [
        ['ID', 'Stage'],
        [deal.id, 'Closing'],
      ],
      Contacts: [
        ['Name', 'Email', 'Company', 'Tags'],
        ['', 'nobody@example.com', 'Brand New Co', 'Brand new tag'],
        ['Bad Email', 'not-an-email', '', ''],
      ],
      Orders: [
        ['Customer', 'Description', 'Amount', 'Date'],
        ['Unknown Person', 'Licences', '1000', '2026-10-01'],
      ],
    }), state, { now, newId: ids() });
    const moved = plan.ops.find((op) => op.id === deal.id).data;
    expect(moved.stage).toBe('closing');
    expect(moved.probability).toBe(85);
    expect(moved.stageHistory.at(-1)).toEqual({ stage: 'closing', at: now.toISOString() });
    expect(plan.problems).toEqual([
      { sheet: 'Contacts', row: 2, message: 'Name is required' },
      { sheet: 'Contacts', row: 3, message: '"not-an-email" is not a valid email' },
      { sheet: 'Orders', row: 2, message: 'No customer matches "Unknown Person". Add them on the Customers sheet first' },
    ]);
    expect(plan.counts.companies.created).toBe(0);
    expect(plan.counts.tags.created).toBe(0);
    expect(plan.ops).toHaveLength(1);
  });

  it('explains when a workbook has none of the NEXUS sheets', () => {
    const plan = planSpreadsheetImport(book({ Sheet1: [['a'], ['b']] }), emptyDocument(), { now });
    expect(plan.problems[0].message).toContain('none of the NEXUS sheets');
  });
});
