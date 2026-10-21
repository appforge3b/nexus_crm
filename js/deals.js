import { STAGE_PROBABILITY, STAGES, LOST_REASONS } from './stages.js';

export { STAGE_PROBABILITY, STAGES, LOST_REASONS };

const PIPELINE = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];

export function nextProbability(previousStage, nextStage, currentProbability) {
  if (currentProbability == null || currentProbability === STAGE_PROBABILITY[previousStage]) {
    return STAGE_PROBABILITY[nextStage];
  }
  return currentProbability;
}

export function isBackwardMove(from, to) {
  if (from === to || to === 'lost') return false;
  const fromIndex = PIPELINE.indexOf(from);
  const toIndex = PIPELINE.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
}

function localDate(now) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function moveDeal(store, dealId, nextStage, options = {}) {
  const deal = store.getById('deals', dealId);
  if (!deal) return { ok: false };
  if (deal.stage === nextStage) return { ok: true };
  if (isBackwardMove(deal.stage, nextStage) && !options.confirm) {
    return { ok: false, needsConfirmation: true };
  }
  if (nextStage === 'lost' && !String(options.lostReason ?? '').trim()) {
    return { ok: false, needsLostReason: true };
  }
  const now = options.now ?? new Date();
  store.update('deals', dealId, {
    stage: nextStage,
    probability: nextProbability(deal.stage, nextStage, deal.probability),
    lostReason: nextStage === 'lost' ? options.lostReason : deal.lostReason,
    stageChangedAt: now.toISOString(),
  });
  const existing = store.query('customers', (customer) => customer.contactId === deal.contactId);
  const contact = store.getById('contacts', deal.contactId);
  const askConversion = nextStage === 'won' && existing.length === 0 && contact?.status !== 'customer';
  return { ok: true, celebrate: nextStage === 'won', askConversion };
}

export function confirmConversion(store, dealId, accept, { now } = {}) {
  if (!accept) return { customer: null };
  const deal = store.getById('deals', dealId);
  const moment = now ?? new Date();
  let customer = store.query('customers', (item) => item.contactId === deal.contactId)[0] ?? null;
  if (!customer) {
    customer = store.create('customers', {
      contactId: deal.contactId,
      convertedDealId: deal.id,
      convertedAt: moment.toISOString(),
      satisfactionRating: null,
      notes: '',
    });
    store.update('contacts', deal.contactId, { status: 'customer' });
  }
  store.create('orders', {
    customerId: customer.id,
    description: deal.title,
    amount: deal.value,
    status: 'completed',
    date: localDate(moment),
    notes: '',
  });
  return { customer: store.getById('customers', customer.id) };
}
