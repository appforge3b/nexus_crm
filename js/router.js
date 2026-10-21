const VIEWS = new Set(['briefing', 'pipeline', 'roster', 'chronicle', 'radar', 'customers', 'settings']);

export function parseRoute(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const name = path.replace(/^\//, '') || 'briefing';
  const view = VIEWS.has(name) ? name : 'briefing';
  const params = {};
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) params[key] = value;
  }
  return { view, params };
}
