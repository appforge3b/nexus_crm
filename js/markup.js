export { icon } from './icons.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const NAV = [
  ['briefing', 'Briefing', '#/briefing'],
  ['pipeline', 'Pipeline', '#/pipeline'],
  ['roster', 'Roster', '#/roster'],
  ['chronicle', 'Chronicle', '#/chronicle'],
  ['radar', 'Radar', '#/radar'],
  ['customers', 'Customers', '#/customers'],
];
