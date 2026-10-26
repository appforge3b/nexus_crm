import { clockTime, shortDate } from './agenda.js';

export const DEFAULT_COUNTRY_CODE = '+91';

export const DEFAULT_TEMPLATES = [
  { id: 'follow-up', name: 'Follow-up', body: 'Hi {firstName}, following up on {deal}. Is there anything you need from my side to move ahead? Happy to set up a quick call.' },
  { id: 'thanks', name: 'Thanks for your time', body: 'Hi {firstName}, thank you for your time today. I will share a short summary and the next steps shortly.\n– {myName}' },
  { id: 'meeting', name: 'Meeting confirmation', body: 'Hi {firstName}, confirming {nextStep} on {nextStepDate}. Looking forward to it.\n– {myName}' },
  { id: 'proposal', name: 'Proposal sent', body: 'Hi {firstName}, I have sent across the proposal for {deal}. When would be a good time to walk your team through it?' },
  { id: 'check-in', name: 'Check-in', body: 'Hi {firstName}, just checking in. How are things at {company}? Anything I can help with this week?' },
];

const FALLBACKS = {
  firstName: 'there',
  company: 'your end',
  deal: 'our discussion',
  nextStep: 'our meeting',
  nextStepDate: 'the agreed date',
  myName: '',
};

function digitsOf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** International digits for wa.me and tel: links. Local numbers get the default country code. */
export function toWhatsAppNumber(phone, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';
  let digits;
  if (raw.startsWith('+')) digits = digitsOf(raw);
  else {
    digits = digitsOf(raw);
    if (digits.startsWith('00')) digits = digits.slice(2);
    else {
      const code = digitsOf(defaultCountryCode) || digitsOf(DEFAULT_COUNTRY_CODE);
      const local = digits.replace(/^0+/, '');
      digits = local.length > 10 && local.startsWith(code) ? local : `${code}${local}`;
    }
  }
  return digits.length >= 8 ? digits : '';
}

export function hasDialableNumber(phone, defaultCountryCode) {
  return Boolean(toWhatsAppNumber(phone, defaultCountryCode));
}

export function waLink(phone, text = '', defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  const number = toWhatsAppNumber(phone, defaultCountryCode);
  if (!number) return '';
  const message = String(text ?? '').trim();
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function telLink(phone, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  const number = toWhatsAppNumber(phone, defaultCountryCode);
  return number ? `tel:+${number}` : '';
}

export function mailtoLink(email, subject = '', body = '') {
  const address = String(email ?? '').trim();
  if (!address) return '';
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${address}${params.length ? `?${params.join('&')}` : ''}`;
}

export function templateVars({ contact, company, deal, nextStep, settings } = {}) {
  const myName = settings?.userName && settings.userName !== 'there' ? settings.userName : '';
  return {
    firstName: String(contact?.name ?? '').trim().split(/\s+/)[0] || '',
    company: company?.name || contact?.company || '',
    deal: deal?.title || '',
    nextStep: nextStep?.title || '',
    nextStepDate: nextStep ? `${shortDate(nextStep.date)}, ${clockTime(nextStep.date)}` : '',
    myName,
  };
}

export function renderTemplate(body, vars = {}) {
  const lines = String(body ?? '').split('\n').filter((line) => {
    const tokens = [...line.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const stripped = line.replace(/\{\w+\}/g, '').replace(/[\s–—-]/g, '');
    return !(tokens.length && !stripped && tokens.every((token) => !String(vars[token] ?? '').trim()));
  });
  return lines
    .join('\n')
    .replace(/\{(\w+)\}/g, (match, key) => {
      const value = String(vars[key] ?? '').trim();
      if (value) return value;
      return key in FALLBACKS ? FALLBACKS[key] : match;
    })
    .trim();
}

export function templatesFrom(settings) {
  const saved = settings?.templates;
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_TEMPLATES;
}
