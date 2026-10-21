export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function icon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"></circle></svg>';
}

export const NAV = [
  ['briefing', 'Briefing', '#/briefing'],
  ['pipeline', 'Pipeline', '#/pipeline'],
  ['roster', 'Roster', '#/roster'],
  ['chronicle', 'Chronicle', '#/chronicle'],
  ['radar', 'Radar', '#/radar'],
  ['customers', 'Customers', '#/customers'],
];
