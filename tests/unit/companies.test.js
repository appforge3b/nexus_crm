import { describe, expect, it } from 'vitest';
import {
  companyOf,
  dealContactIds,
  dealsForCompany,
  peopleAt,
  stakeholderEntries,
  stakeholdersFor,
} from '../../js/companies.js';
import { filterCompanies, filterDeals } from '../../js/filters.js';
import { validateCompany } from '../../js/validation.js';

const companies = [{ id: 'co1', name: 'Helios Bank', industry: 'Banking' }];
const contacts = [
  { id: 'a', name: 'Asha Rao', company: 'Helios Bank', companyId: 'co1' },
  { id: 'v', name: 'Vikram Mehta', company: 'helios  bank' },
  { id: 'r', name: 'Ravi Krishnan', company: 'Tata Digital' },
];
const deal = { id: 'd1', title: 'Mobile', contactId: 'a', stakeholders: [{ contactId: 'v', role: 'Finance' }, { contactId: 'a', role: 'Champion' }] };

describe('companies', () => {
  it('resolves a contact’s company by id, falling back to the normalised name', () => {
    expect(companyOf(contacts[0], companies).id).toBe('co1');
    expect(companyOf(contacts[1], companies).id).toBe('co1');
    expect(companyOf(contacts[2], companies)).toBeNull();
    expect(peopleAt(companies[0], contacts, companies).map((person) => person.id)).toEqual(['a', 'v']);
  });

  it('lists the primary contact first, with roles and no duplicates', () => {
    expect(stakeholderEntries(deal)).toEqual([
      { contactId: 'a', role: 'Champion', primary: true },
      { contactId: 'v', role: 'Finance', primary: false },
    ]);
    expect(dealContactIds(deal)).toEqual(['a', 'v']);
    expect(stakeholdersFor(deal, contacts).map((entry) => entry.contact.name)).toEqual(['Asha Rao', 'Vikram Mehta']);
    expect(dealsForCompany(companies[0], [deal], contacts, companies)).toEqual([deal]);
  });

  it('searches deals by stakeholder and company, and companies by their people', () => {
    expect(filterDeals([deal], contacts, { search: 'vikram' }, companies)).toHaveLength(1);
    expect(filterDeals([deal], contacts, { search: 'helios' }, companies)).toHaveLength(1);
    expect(filterCompanies(companies, contacts, 'asha')).toHaveLength(1);
    expect(filterCompanies(companies, contacts, 'banking')).toHaveLength(1);
    expect(filterCompanies(companies, contacts, 'tata')).toHaveLength(0);
  });

  it('requires a unique company name', () => {
    expect(validateCompany({ name: ' ' }, { companies }).errors[0].message).toBe('Company name is required');
    expect(validateCompany({ name: 'HELIOS BANK' }, { companies }).errors[0].message).toBe('A company with that name already exists');
    expect(validateCompany({ name: 'Tata Digital' }, { companies }).ok).toBe(true);
  });
});
