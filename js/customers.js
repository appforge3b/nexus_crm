import { ACTIVE_STAGES } from './stages.js';

export function customerStats(orders) {
  const live = (orders ?? []).filter((order) => order.status !== 'cancelled');
  const revenue = live.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const orderCount = live.length;
  const dates = live.map((order) => order.date).filter(Boolean).sort();
  return {
    revenue,
    orderCount,
    average: orderCount ? revenue / orderCount : 0,
    lastOrderDate: dates.at(-1) ?? null,
  };
}

export function openDealsForContact(deals, contactId) {
  return (deals ?? []).filter((deal) => deal.contactId === contactId && ACTIVE_STAGES.includes(deal.stage));
}

export function lifetimeValue(deals, orders, contactId, customerId) {
  const won = (deals ?? [])
    .filter((deal) => deal.contactId === contactId && deal.stage === 'won')
    .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const booked = (orders ?? [])
    .filter((order) => order.customerId === customerId && order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.amount || 0), 0);
  return won + booked;
}
