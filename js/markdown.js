function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function renderNotes(text) {
  const source = String(text ?? '');
  const lines = source.split('\n');
  if (lines.every((line) => line.trim().startsWith('- ') || line.trim() === '')) {
    const items = lines.filter((line) => line.trim().startsWith('- '));
    return `<ul>${items.map((line) => `<li>${inline(line.trim().slice(2))}</li>`).join('')}</ul>`;
  }
  return `<p>${inline(source)}</p>`;
}
