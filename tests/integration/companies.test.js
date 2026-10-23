import { beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, navigate, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

function dialog() {
  return document.querySelector('.overlay-host [role="dialog"]');
}

function confirmYes() {
  click(document.querySelector('[role="alertdialog"] [data-action="confirm-yes"]'));
}

describe('companies and stakeholders', () => {
  let app;
  let helios;
  let asha;
  let vikram;
  let deal;

  beforeEach(() => {
    app = mount({ hash: '#/roster' });
    helios = app.store.create('companies', { name: 'Helios Bank', industry: 'Banking', website: '', notes: '' });
    asha = app.store.create('contacts', {
      name: 'Asha Rao', company: 'Helios Bank', companyId: helios.id, title: 'Head of Digital', status: 'prospect',
      email: 'asha@helios.example', phone: '98765 43210', tags: [], notes: '', source: '',
    });
    vikram = app.store.create('contacts', {
      name: 'Vikram Mehta', company: 'Helios Bank', companyId: helios.id, title: 'CFO', status: 'prospect',
      email: '', phone: '98111 22233', tags: [], notes: '', source: '',
    });
    deal = app.store.create('deals', {
      title: 'Helios mobile banking', contactId: asha.id, companyId: helios.id, stakeholders: [{ contactId: asha.id, role: 'Champion' }],
      value: 500000, stage: 'proposal', priority: 'high', probability: 50, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 20, 9).toISOString(),
    });
  });

  it('links a new contact to an existing company case-insensitively and creates new companies on the fly', () => {
    click('[data-action="new-contact"]');
    setValue(field('name', dialog()), 'Neha Iyer');
    setValue(field('company', dialog()), 'helios bank');
    expect(dialog().querySelector('[data-company-hint]').textContent).toContain('Links to Helios Bank');
    click(dialog().querySelector('[data-action="save-modal"]'));
    const neha = app.store.getAll('contacts').find((contact) => contact.name === 'Neha Iyer');
    expect(neha.companyId).toBe(helios.id);
    expect(neha.company).toBe('Helios Bank');

    click('[data-action="new-contact"]');
    setValue(field('name', dialog()), 'Ravi Krishnan');
    setValue(field('company', dialog()), 'Tata Digital');
    expect(dialog().querySelector('[data-company-hint]').textContent).toContain('new company');
    click(dialog().querySelector('[data-action="save-modal"]'));
    expect(app.store.getAll('companies').map((company) => company.name).sort()).toEqual(['Helios Bank', 'Tata Digital']);
  });

  it('shows companies in the roster with their people, and adds a person from the company panel', () => {
    click('[data-roster-mode="companies"]');
    const view = document.querySelector('[data-view="roster"]');
    expect(view.querySelector('h1').textContent).toBe('Companies');
    const card = view.querySelector(`.company-card[data-company-id="${helios.id}"]`);
    expect(card.textContent).toContain('Helios Bank');
    click(card);
    expect(window.location.hash).toBe(`#/roster?company=${helios.id}`);
    const panel = document.querySelector('[data-panel="company"]');
    const people = panel.querySelector('[data-region="company-people"]').textContent;
    expect(people).toContain('Asha Rao');
    expect(people).toContain('Vikram Mehta');
    expect(panel.textContent).toContain('Helios mobile banking');

    click(panel.querySelector('[data-action="new-contact"][data-company-name]'));
    expect(field('company', dialog()).value).toBe('Helios Bank');
  });

  it('adds stakeholders with roles from the deal drawer, swaps the primary, and undoes a removal', () => {
    navigate(`#/pipeline?deal=${deal.id}`);
    const region = () => document.querySelector('[data-panel] [data-region="stakeholders"]');
    expect(region().querySelectorAll('.person-row')).toHaveLength(1);

    setValue(region().querySelector('[data-field="addStakeholder"]'), vikram.id);
    setValue(region().querySelector('[data-field="addStakeholderRole"]'), 'Finance');
    click(region().querySelector('[data-action="add-stakeholder"]'));
    expect(app.store.getById('deals', deal.id).stakeholders).toEqual([
      { contactId: asha.id, role: 'Champion' },
      { contactId: vikram.id, role: 'Finance' },
    ]);
    expect(region().querySelectorAll('.person-row')).toHaveLength(2);

    setValue(region().querySelector(`[data-stakeholder-role="${vikram.id}"]`), 'Decision maker');
    expect(app.store.getById('deals', deal.id).stakeholders[1].role).toBe('Decision maker');

    click(region().querySelector(`[data-action="make-primary"][data-contact-ref="${vikram.id}"]`));
    expect(app.store.getById('deals', deal.id).contactId).toBe(vikram.id);

    click(region().querySelector(`[data-action="remove-stakeholder"][data-contact-ref="${asha.id}"]`));
    expect(app.store.getById('deals', deal.id).stakeholders.map((item) => item.contactId)).toEqual([vikram.id]);
    click('[data-action="toast-action"]');
    expect(app.store.getById('deals', deal.id).stakeholders.map((item) => item.contactId)).toEqual([vikram.id, asha.id]);
  });

  it('offers colleagues as stakeholders in the deal form and keeps their roles on save', () => {
    navigate('#/pipeline');
    click('[data-action="new-context"]');
    setValue(field('title', dialog()), 'Helios cards');
    setValue(field('contact', dialog()), asha.id);
    setValue(field('value', dialog()), '120000');
    const box = dialog().querySelector(`[data-stakeholder-option][value="${vikram.id}"]`);
    expect(box.closest('label').hidden).toBe(false);
    expect(dialog().querySelector(`[data-stakeholder-option][value="${asha.id}"]`).closest('label').hidden).toBe(true);
    box.checked = true;
    click(dialog().querySelector('[data-action="save-modal"]'));
    const created = app.store.getAll('deals').find((item) => item.title === 'Helios cards');
    expect(created.companyId).toBe(helios.id);
    expect(created.stakeholders.map((item) => item.contactId)).toEqual([asha.id, vikram.id]);
  });

  it('hands a deal to the next stakeholder when the primary contact is deleted', () => {
    app.store.update('deals', deal.id, { stakeholders: [{ contactId: asha.id, role: 'Champion' }, { contactId: vikram.id, role: 'Finance' }] });
    navigate(`#/roster?contact=${asha.id}`);
    click(document.querySelector('[data-panel] [data-action="delete"][data-kind="contact"]'));
    confirmYes();
    const kept = app.store.getById('deals', deal.id);
    expect(kept.contactId).toBe(vikram.id);
    expect(kept.stakeholders).toEqual([{ contactId: vikram.id, role: 'Finance' }]);
  });

  it('deletes a company but keeps its people and deals', () => {
    navigate(`#/roster?company=${helios.id}`);
    click(document.querySelector('[data-panel="company"] [data-action="delete"][data-kind="company"]'));
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('2 people stay');
    confirmYes();
    expect(app.store.getAll('companies')).toHaveLength(0);
    expect(app.store.getById('contacts', asha.id).companyId).toBeNull();
    expect(app.store.getById('deals', deal.id).companyId).toBeNull();
  });
});
