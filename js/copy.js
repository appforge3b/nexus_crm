export const IMPORT_WARNING = 'This will replace ALL existing data. This action cannot be undone.';

export const LOST_PROMPT = 'Why was this deal lost?';

function count(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function deleteContactMessage(name, dealCount) {
  if (dealCount > 0) {
    const deals = count(dealCount, 'deal', 'deals');
    return `Delete ${name}? This contact has ${deals.replace(/^\d+ /, `${dealCount} associated `)}, which will also be deleted. This cannot be undone.`;
  }
  return `Delete ${name}? This cannot be undone.`;
}

export function deleteDealMessage(title) {
  return `Delete ${title}? This cannot be undone.`;
}

export function backwardMoveMessage(stageLabelText) {
  return `Move this deal back to ${stageLabelText}? This usually indicates a setback.`;
}

export function conversionMessage(name) {
  return `Convert ${name} to a customer?`;
}

export function importPreviewText(summary) {
  return `This file contains: ${count(summary.contacts, 'contact', 'contacts')}, ${count(summary.deals, 'deal', 'deals')}, ${count(summary.activities, 'activity', 'activities')}, ${count(summary.customers, 'customer', 'customers')}, ${count(summary.orders, 'order', 'orders')}, ${count(summary.tags, 'tag', 'tags')}.`;
}
