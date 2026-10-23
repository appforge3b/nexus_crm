import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  hasDialableNumber,
  mailtoLink,
  renderTemplate,
  telLink,
  templateVars,
  templatesFrom,
  toWhatsAppNumber,
  waLink,
} from '../../js/messaging.js';

describe('messaging', () => {
  it('normalises phone numbers for wa.me and tel: links', () => {
    expect(toWhatsAppNumber('98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('098765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
    expect(toWhatsAppNumber('0044 7700 900123')).toBe('447700900123');
    expect(toWhatsAppNumber('91 98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('(212) 555-0100', '+1')).toBe('12125550100');
    expect(toWhatsAppNumber('12345')).toBe('');
    expect(hasDialableNumber('', '+91')).toBe(false);
  });

  it('builds WhatsApp, phone and email links', () => {
    expect(waLink('98765 43210', 'Hi & welcome')).toBe('https://wa.me/919876543210?text=Hi%20%26%20welcome');
    expect(waLink('98765 43210')).toBe('https://wa.me/919876543210');
    expect(telLink('98765 43210')).toBe('tel:+919876543210');
    expect(mailtoLink('a@b.example', 'Deal', 'Line one')).toBe('mailto:a@b.example?subject=Deal&body=Line%20one');
  });

  it('fills template placeholders and drops lines that only held empty ones', () => {
    const vars = templateVars({
      contact: { name: 'Priya Shah' },
      company: { name: 'Northwind' },
      deal: { title: 'Retainer' },
      settings: { userName: 'there' },
    });
    expect(renderTemplate('Hi {firstName}, re {deal} at {company}.\n– {myName}', vars)).toBe('Hi Priya, re Retainer at Northwind.');
    expect(renderTemplate('Confirming {nextStep} on {nextStepDate}', vars)).toBe('Confirming our meeting on the agreed date');
  });

  it('falls back to the default templates when none are saved', () => {
    expect(templatesFrom({})).toBe(DEFAULT_TEMPLATES);
    expect(templatesFrom({ templates: [] })).toBe(DEFAULT_TEMPLATES);
    expect(templatesFrom({ templates: [{ id: 'x', name: 'X', body: 'y' }] })).toHaveLength(1);
  });
});
