const HASHES = ['#/briefing', '#/pipeline', '#/roster', '#/chronicle', '#/radar', '#/customers'];

function typing(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
}

export function shortcutAction(event) {
  if (event.key === 'Escape') return { type: 'close' };
  if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key >= '1' && event.key <= '6') return { type: 'navigate', hash: HASHES[Number(event.key) - 1] };
  if (event.key === 'n' || event.key === 'N') return { type: 'create' };
  if (event.key === '/') return { type: 'search' };
  if (event.key === '?') return { type: 'help' };
  return null;
}
