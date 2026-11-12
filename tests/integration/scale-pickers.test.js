import { beforeEach, describe, expect, it } from 'vitest';
import { click, mount, navigate, setValue } from '../helpers/mount.js';
import { COMPANY_DATALIST_THRESHOLD, PICKER_LIMIT } from '../../js/view-helpers.js';
import { emptyDocument } from '../../js/store.js';

describe('large dataset picker and datalist scaling', () => {
  let app;
  let companyIds;

  beforeEach(() => {
    app = mount({ hash: '#/pipeline' });
    const doc = emptyDocument();
    doc.settings = app.store.getSettings();
    companyIds = [];
    for (let i = 1; i <= 250; i++) {
      const n = String(i).padStart(3, '0');
      const cid = `co_${n}`;
      companyIds.push(cid);
      doc.companies.push({ id: cid, name: `Agency ${n}`, industry: 'Digital', tags: [] });
      doc.contacts.push({
        id: `cnt_${n}`,
        name: `Contact ${n}`,
        email: `c${n}@agency.test`,
        company: `Agency ${n}`,
        companyId: cid,
        tags: [],
        status: 'prospect',
      });
    }
    // Add a colleague at Agency 240 so stakeholder filtering can be verified.
    doc.contacts.push({
      id: 'cnt_col_240',
      name: 'Colleague TwoForty',
      email: 'colleague@agency240.test',
      company: 'Agency 240',
      companyId: companyIds[239],
      tags: [],
      status: 'prospect',
    });
    app.store.replaceState(doc);
  });

  it('caps contact picker options to PICKER_LIMIT and searches across the full directory', () => {
    click('[data-action="new-deal"]');
    const dialog = document.querySelector('[role="dialog"]');
    const select = dialog.querySelector('[data-field="contact"]');
    const search = dialog.querySelector('[data-picker-for="contact"]');
    const checkboxes = dialog.querySelectorAll('[data-stakeholder-option]');

    expect(select.options.length).toBeLessThanOrEqual(PICKER_LIMIT + 1);
    expect(checkboxes).toHaveLength(0);

    // Search for Contact 240 which sits past the initial alphabetical 100 slice.
    search.value = 'Contact 240';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(select.value).toBeTruthy();
    expect(select.selectedOptions[0].textContent).toContain('Contact 240');

    const visibleCols = [...dialog.querySelectorAll('[data-stakeholder-option]')].filter((box) => !box.closest('label').hidden);
    expect(visibleCols).toHaveLength(1);
    expect(visibleCols[0].closest('label').textContent).toContain('Colleague TwoForty');
  });

  it('leaves huge company datalists empty until typed in the contact modal', () => {
    navigate('#/roster');
    click('[data-action="new-contact"]');
    const dialog = document.querySelector('[role="dialog"]');
    const datalist = dialog.querySelector('#company-options');
    const companyInput = dialog.querySelector('[data-field="company"]');

    expect(250).toBeGreaterThan(COMPANY_DATALIST_THRESHOLD);
    expect(datalist.querySelectorAll('option')).toHaveLength(0);

    companyInput.value = 'Agency 24';
    companyInput.dispatchEvent(new Event('input', { bubbles: true }));
    const values = [...datalist.querySelectorAll('option')].map((opt) => opt.value);
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain('Agency 240');
    expect(dialog.querySelector('[data-company-hint]').textContent).toContain('A new company');

    setValue(companyInput, 'Agency 240');
    expect(dialog.querySelector('[data-company-hint]').textContent).toBe('Links to Agency 240');
  });

  it('caps deal panel addStakeholder select and adds a search filter across all contacts', () => {
    const c1 = app.store.read('contacts')[0];
    const deal = app.store.create('deals', {
      title: 'Website Refresh',
      contactId: c1.id,
      companyId: c1.companyId,
      value: 15000,
      stage: 'qualified',
      priority: 'medium',
      stakeholders: [{ contactId: c1.id, role: '' }],
    });
    click(`[data-deal-id="${deal.id}"]`);
    const panel = document.querySelector('[data-panel="deal"]');
    const search = panel.querySelector('[data-picker-for="addStakeholder"]');
    const select = panel.querySelector('[data-field="addStakeholder"]');

    expect(search).not.toBeNull();
    expect(select.options.length).toBeLessThanOrEqual(PICKER_LIMIT + 1);

    search.value = 'Contact 240';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(select.value).toBeTruthy();
    expect(select.selectedOptions[0].textContent).toContain('Contact 240');
  });

  it('caps Chronicle contact filter select while preserving contacts with activities', () => {
    const lateContact = app.store.read('contacts').find((c) => c.name === 'Contact 249');
    app.store.create('activities', {
      type: 'call',
      contactId: lateContact.id,
      title: 'Intro call',
      date: new Date(2026, 9, 21, 9).toISOString(),
    });
    navigate('#/chronicle');
    const select = document.querySelector('[data-field="chronContact"]');
    expect(select.options.length).toBeLessThanOrEqual(PICKER_LIMIT + 1);
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain(lateContact.id);
  });
});

