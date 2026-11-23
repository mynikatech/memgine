import type { CounterOrder } from '@/src/data/api/counter-api';

/** The lifecycle projection is the server's financial and verification gate. */
export function counterFinancialComplete(order: CounterOrder): boolean {
  const lifecycle = order.lifecycle;
  return !!lifecycle?.verificationMethod && !lifecycle.collectionBlocker &&
    ['PLACED', 'PREPARING', 'READY'].includes(order.status) &&
    ['VERIFIED_ONLINE', 'VERIFIED_AT_COUNTER', 'NO_PAYMENT_REQUIRED'].includes(lifecycle.payment);
}

export function counterFinancialReviewAvailable(order: CounterOrder): boolean {
  return !!order.currencyCode && order.items.length > 0 &&
    [order.subtotalMinor, order.discountMinor, order.taxMinor, order.totalMinor].every((amount) => typeof amount === 'number' && Number.isFinite(amount)) &&
    order.items.every((item) => item.name && item.quantity > 0 && item.unitPriceMinor != null && item.subtotalMinor != null);
}
