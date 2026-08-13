import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

/**
 * ActiveCustomerContext — the lightweight, reusable notion of which
 * Organization + Subscription the customer is currently viewing.
 *
 * This is NOT business switching / discovery / account-level switching. It is
 * only the context future customer screens need to know which subscription (and
 * therefore which organization) is in view. Selecting a card in My Cards
 * establishes it.
 */
export type ActiveCustomerContext = {
  organizationId: string | null;
  subscriptionId: string | null;
};

type CustomerContextValue = ActiveCustomerContext & {
  /** The active mock customer identity (demo persona switch). */
  customerId: string;
  setActiveContext: (organizationId: string, subscriptionId: string) => void;
  clearActiveContext: () => void;
  /** Switch the selected subscription WITHIN the current organization. */
  setActiveSubscription: (subscriptionId: string) => void;
  /** Switch which mock customer the session acts as (demo personas). */
  setActiveCustomer: (customerId: string) => void;
  /** Semantic alias: entering a selected business (+ subscription) context. */
  enterBusiness: (organizationId: string, subscriptionId: string) => void;
  /** Semantic alias: returning to the Memgine platform "Your Memberships". */
  exitBusiness: () => void;
};

const DEFAULT_CUSTOMER_ID = "cust-1";

const CustomerCtx = createContext<CustomerContextValue | null>(null);

export function CustomerContextProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<ActiveCustomerContext>({
    organizationId: null,
    subscriptionId: null,
  });
  const [customerId, setCustomerId] = useState<string>(DEFAULT_CUSTOMER_ID);

  const setActiveContext = useCallback(
    (organizationId: string, subscriptionId: string) => setCtx({ organizationId, subscriptionId }),
    [],
  );
  const clearActiveContext = useCallback(
    () => setCtx({ organizationId: null, subscriptionId: null }),
    [],
  );
  // Change only the subscription in view; the organization stays the same, so
  // branding/template/business navigation are unaffected.
  const setActiveSubscription = useCallback(
    (subscriptionId: string) => setCtx((prev) => ({ organizationId: prev.organizationId, subscriptionId })),
    [],
  );
  const setActiveCustomer = useCallback((id: string) => setCustomerId(id), []);

  const value = useMemo<CustomerContextValue>(
    () => ({
      ...ctx,
      customerId,
      setActiveContext,
      clearActiveContext,
      setActiveSubscription,
      setActiveCustomer,
      enterBusiness: setActiveContext,
      exitBusiness: clearActiveContext,
    }),
    [ctx, customerId, setActiveContext, clearActiveContext, setActiveSubscription, setActiveCustomer],
  );

  return <CustomerCtx.Provider value={value}>{children}</CustomerCtx.Provider>;
}

export function useCustomerContext(): CustomerContextValue {
  const c = useContext(CustomerCtx);
  if (!c) throw new Error("useCustomerContext must be used within a CustomerContextProvider");
  return c;
}
