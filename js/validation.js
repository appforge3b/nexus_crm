const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const IMPORT_KEYS = ['contacts', 'deals', 'activities', 'customers', 'orders', 'tags'];

function fail(errors) {
  return { ok: false, errors };
}

function ok(value) {
  return { ok: true, value, errors: [] };
}

export function validateContact(data, { tags = [] } = {}) {
  const errors = [];
  if (!String(data?.name ?? '').trim()) errors.push({ field: 'name', message: 'Name is required' });
  const email = String(data?.email ?? '').trim();
  if (email && !EMAIL.test(email)) errors.push({ field: 'email', message: 'Email is invalid' });
  const known = new Set(tags.map((tag) => tag.id));
  if (Array.isArray(data?.tags) && data.tags.some((id) => !known.has(id))) {
    errors.push({ field: 'tags', message: 'Unknown tag' });
  }
  return errors.length ? fail(errors) : ok(data);
}

export function validateDeal(data, { contacts = [] } = {}) {
  const errors = [];
  if (!String(data?.title ?? '').trim()) errors.push({ field: 'title', message: 'Title is required' });
  if (!String(data?.contactId ?? '').trim()) errors.push({ field: 'contactId', message: 'Contact is required' });
  else if (!contacts.some((contact) => contact.id === data.contactId)) {
    errors.push({ field: 'contactId', message: 'Contact is required' });
  }
  const value = Number(data?.value);
  if (!Number.isFinite(value) || value < 0) errors.push({ field: 'value', message: 'Value must be zero or greater' });
  if (data?.stage === 'lost' && !String(data?.lostReason ?? '').trim()) {
    errors.push({ field: 'lostReason', message: 'Lost reason is required' });
  }
  return errors.length ? fail(errors) : ok(data);
}

export function validateActivity(data, { contacts = [], deals = [] } = {}) {
  const errors = [];
  if (!String(data?.contactId ?? '').trim() || !contacts.some((contact) => contact.id === data.contactId)) {
    errors.push({ field: 'contact', message: 'Contact is required' });
  }
  if (!String(data?.title ?? '').trim()) errors.push({ field: 'title', message: 'Title is required' });
  if (!String(data?.date ?? '').trim()) errors.push({ field: 'date', message: 'Date is required' });
  if (data?.dealId) {
    const deal = deals.find((item) => item.id === data.dealId);
    if (!deal || deal.contactId !== data.contactId) errors.push({ field: 'deal', message: 'Deal does not belong to this contact' });
  }
  if (data?.duration != null && data.duration !== '' && Number(data.duration) < 0) {
    errors.push({ field: 'duration', message: 'Duration must be zero or greater' });
  }
  return errors.length ? fail(errors) : ok(data);
}

export function validateOrder(data) {
  const errors = [];
  if (!String(data?.description ?? '').trim()) errors.push({ field: 'description', message: 'Description is required' });
  const amount = Number(data?.amount);
  if (!Number.isFinite(amount) || amount < 0) errors.push({ field: 'amount', message: 'Amount must be zero or greater' });
  if (!String(data?.date ?? '').trim()) errors.push({ field: 'date', message: 'Date is required' });
  return errors.length ? fail(errors) : ok(data);
}

export function validateTag(data, { tags = [] } = {}) {
  const errors = [];
  const name = String(data?.name ?? '').trim();
  if (!name) errors.push({ field: 'name', message: 'Tag name is required' });
  else if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
    errors.push({ field: 'name', message: 'Tag already exists' });
  }
  if (!HEX.test(String(data?.color ?? '').trim())) errors.push({ field: 'color', message: 'Color must be a hex code' });
  if (errors.some((error) => error.message === 'Tag already exists') && HEX.test(String(data?.color ?? '').trim())) {
    return fail(errors.filter((error) => error.message === 'Tag already exists'));
  }
  return errors.length ? fail(errors) : ok(data);
}

export function validateImport(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail([{ field: 'document', message: 'Import is invalid' }]);
  }
  const errors = [];
  for (const key of IMPORT_KEYS) {
    if (!Array.isArray(parsed[key])) errors.push({ field: key, message: `${key} must be an array` });
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    errors.push({ field: 'settings', message: 'settings must be an object' });
  }
  if (typeof parsed.version !== 'number') errors.push({ field: 'version', message: 'version is required' });
  return errors.length ? fail(errors) : ok(parsed);
}
