import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, field, mount, navigate, setValue } from '../helpers/mount.js';
import { at } from '../helpers/time.js';

function dialog() {
  return document.querySelector('.overlay-host [role="dialog"]');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('messages and calls', () => {
  let app;
  let opened;
  let copied;
  let priya;
  let arjun;
  let deal;

  beforeEach(() => {
    opened = [];
    copied = [];
    app = mount({
      hash: '#/pipeline',
      openUrl: (url) => opened.push(url),
      clipboard: { writeText: (text) => { copied.push(text); return Promise.resolve(); } },
    });
    app.store.updateSettings({ userName: 'Puja' });
    const company = app.store.create('companies', { name: 'Northwind', industry: '', website: '', notes: '' });
    priya = app.store.create('contacts', {
      name: 'Priya Shah', company: 'Northwind', companyId: company.id, title: 'CFO', status: 'active',
      email: 'priya@northwind.example', phone: '98765 43210', tags: [], notes: '', source: '',
    });
    arjun = app.store.create('contacts', {
      name: 'Arjun Nair', company: 'Northwind', companyId: company.id, title: 'CTO', status: 'active',
      email: '', phone: '+44 7700 900123', tags: [], notes: '', source: '',
    });
    deal = app.store.create('deals', {
      title: 'Northwind retainer', contactId: priya.id, companyId: company.id, stakeholders: [{ contactId: priya.id, role: '' }],
      value: 250000, stage: 'proposal', priority: 'medium', probability: 50, expectedCloseDate: '', notes: '', lostReason: '',
      stageChangedAt: at(2026, 10, 19, 9).toISOString(),
    });
  });

  it('writes a templated message, opens WhatsApp with the contact selected, and saves it to the Chronicle', async () => {
    navigate(`#/pipeline?deal=${deal.id}`);
    click(document.querySelector('[data-panel] .action-row [data-action="compose"]'));
    expect(dialog().getAttribute('data-modal-type')).toBe('message');
    expect(dialog().querySelector('.compose-to').textContent).toContain('Priya Shah');

    click(dialog().querySelector('[data-action="pick-template"][data-template-id="follow-up"]'));
    const text = field('message', dialog()).value;
    expect(text).toBe('Hi Priya, following up on Northwind retainer. Is there anything you need from my side to move ahead? Happy to set up a quick call.');

    setValue(field('message', dialog()), `${text} Thanks!`);
    expect(dialog().querySelector('[data-preview-text]').textContent).toContain('Thanks!');
    const send = dialog().querySelector('a[data-action="send-whatsapp"]');
    expect(send.getAttribute('aria-disabled')).toBe('false');
    click(send);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(`https://wa.me/919876543210?text=${encodeURIComponent(`${text} Thanks!`)}`);
    const logged = app.store.getAll('activities');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ type: 'whatsapp', status: 'done', channel: 'whatsapp', contactId: priya.id, dealId: deal.id, title: 'Follow-up · WhatsApp' });
    expect(logged[0].description).toContain('Thanks!');

    await tick();
    expect(dialog()).toBeNull();
    expect(document.querySelector('[role="status"]').textContent).toContain('saved to the Chronicle');
    click('[data-action="toast-action"]');
    expect(app.store.getAll('activities')).toHaveLength(0);
  });

  it('switches recipients to another stakeholder and copies the message', async () => {
    app.store.update('deals', deal.id, { stakeholders: [{ contactId: priya.id, role: '' }, { contactId: arjun.id, role: 'Technical' }] });
    click(document.querySelector(`[data-deal-id="${deal.id}"] [data-action="compose"]`));
    const chips = [...dialog().querySelectorAll('[data-action="pick-recipient"]')];
    expect(chips.map((chip) => chip.querySelector('strong').textContent)).toEqual(['Priya Shah', 'Arjun Nair']);
    expect(chips[1].querySelector('small').textContent).toBe('Technical');
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    click(chips[1]);
    expect(dialog().querySelector('.compose-to').textContent).toContain('Arjun Nair');
    expect(dialog().querySelector('a[data-action="send-whatsapp"]').getAttribute('aria-disabled')).toBe('true');
    expect(dialog().querySelector('a[data-action="send-email"]')).toBeNull();

    setValue(field('message', dialog()), 'Hi {firstName}, see you at {company}.');
    expect(dialog().querySelector('[data-preview-text]').textContent).toBe('Hi Arjun, see you at Northwind.');
    click(dialog().querySelector('[data-action="copy-message"]'));
    await tick();
    expect(copied).toEqual(['Hi Arjun, see you at Northwind.']);
    expect(document.querySelector('[role="status"]').textContent).toContain('Message copied');
  });

  it('warns when the contact has no phone number', () => {
    app.store.update('contacts', priya.id, { phone: '' });
    click(document.querySelector(`[data-deal-id="${deal.id}"] [data-action="compose"]`));
    expect(dialog().querySelector('.inline-warning').textContent).toContain('no phone number');
    expect(dialog().querySelector('button[data-action="send-whatsapp"]').disabled).toBe(true);
  });

  it('asks who to call on a deal with several people, then offers phone and WhatsApp', () => {
    app.store.update('deals', deal.id, { stakeholders: [{ contactId: priya.id, role: '' }, { contactId: arjun.id, role: 'Technical' }] });
    click(document.querySelector(`[data-deal-id="${deal.id}"] [data-action="call-sheet"]`));
    expect(dialog().getAttribute('data-modal-type')).toBe('call');
    const people = [...dialog().querySelectorAll('.call-person')];
    expect(people.map((person) => person.querySelector('strong').textContent)).toEqual(['Priya Shah', 'Arjun Nair']);
    click(people[1]);
    const phone = dialog().querySelector('[data-action="call-via"][data-channel="phone"]');
    const whatsapp = dialog().querySelector('[data-action="call-via"][data-channel="whatsapp"]');
    expect(phone.getAttribute('href')).toBe('tel:+447700900123');
    expect(whatsapp.getAttribute('href')).toBe('https://wa.me/447700900123');
    expect(dialog().querySelector('[data-action="call-change"]')).not.toBeNull();
  });

  it('opens the dialler and offers to log the call when the user comes back', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    click(document.querySelector(`[data-deal-id="${deal.id}"] [data-action="call-sheet"]`));
    expect(dialog().querySelector('.call-hero').textContent).toContain('Priya Shah');
    click(dialog().querySelector('[data-action="call-via"][data-channel="whatsapp"]'));
    expect(opened).toEqual(['https://wa.me/919876543210']);
    await tick();
    expect(dialog()).toBeNull();

    window.dispatchEvent(new Event('blur'));
    now.mockReturnValue(1_000_000 + 7 * 60_000);
    window.dispatchEvent(new Event('focus'));
    now.mockRestore();

    expect(dialog().querySelector('#modal-title').textContent).toBe('How did the call go?');
    expect(field('title', dialog()).value).toBe('WhatsApp call with Priya');
    expect(field('duration', dialog()).value).toBe('7');
    expect(field('channel', dialog()).value).toBe('whatsapp');
    setValue(field('outcome', dialog()), 'Agreed to a pilot');
    click(dialog().querySelector('[data-action="save-modal"]'));
    expect(app.store.getAll('activities')[0]).toMatchObject({ type: 'call', channel: 'whatsapp', duration: 7, dealId: deal.id, outcome: 'Agreed to a pilot' });
  });

  it('copies a number and logs a call made outside the app', async () => {
    click(document.querySelector(`[data-deal-id="${deal.id}"] [data-action="call-sheet"]`));
    click(dialog().querySelector('[data-action="copy-number"]'));
    await tick();
    expect(copied).toEqual(['98765 43210']);
    click(dialog().querySelector('[data-action="log-past-call"]'));
    expect(dialog().getAttribute('data-modal-type')).toBe('activity');
    expect(field('contact', dialog()).value).toBe(priya.id);
  });

  it('edits message templates and the default country code in Settings', () => {
    navigate('#/settings');
    const region = document.querySelector('[data-region="messaging-settings"]');
    setValue(region.querySelector('[data-field="countryCode"]'), '+44');
    expect(app.store.getSettings().countryCode).toBe('+44');
    setValue(document.querySelector('[data-template-name="0"]'), 'Nudge');
    expect(app.store.getSettings().templates[0].name).toBe('Nudge');
    click(document.querySelector('[data-region="messaging-settings"] [data-action="add-template"]'));
    expect(app.store.getSettings().templates).toHaveLength(6);
    click(document.querySelector('[data-region="messaging-settings"] [data-action="reset-templates"]'));
    expect(document.querySelector('[data-template-name="0"]').value).toBe('Follow-up');
  });
});
