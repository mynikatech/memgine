/** Ephemeral verified Counter customer details, never written to device storage. */
export type PendingCounterCustomer = {
  firstName: string;
  lastName: string;
  primaryEmail?: string;
  primaryPhone: string;
};
let pending: PendingCounterCustomer | null = null;
export const counterCheckout = {
  set(value: PendingCounterCustomer | null) { pending = value; },
  get() { return pending; },
  clear() { pending = null; },
};
