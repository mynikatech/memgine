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
  setActiveContext: (organizationId: string, subscriptionId: string) => void;
  clearActiveContext: () => void;
  /** Semantic alias: entering a selected business (+ subscription) context. */
  enterBusiness: (organizationId: string, subscriptionId: string) => void;
  /** Semantic alias: returning to the Memgine platform "Your Memberships". */
  exitBusiness: () => void;
};

const CustomerCtx = createContext<CustomerContextValue | null>(null);

export function CustomerContextProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<ActiveCustomerContext>({
    organizationId: null,
    subscriptionId: null,
  });

  const setActiveContext = useCallback(
    (organizationId: string, subscriptionId: string) => setCtx({ organizationId, subscriptionId }),
    [],
  );
  const clearActiveContext = useCallback(
    () => setCtx({ organizationId: null, subscriptionId: null }),
    [],
  );

  const value = useMemo<CustomerContextValue>(
    () => ({
      ...ctx,
      setActiveContext,
      clearActiveContext,
      enterBusiness: setActiveContext,
      exitBusiness: clearActiveContext,
    }),
    [ctx, setActiveContext, clearActiveContext],
  );

  return <CustomerCtx.Provider value={value}>{children}</CustomerCtx.Provider>;
}

export function useCustomerContext(): CustomerContextValue {
  const c = useContext(CustomerCtx);
  if (!c) throw new Error("useCustomerContext must be used within a CustomerContextProvider");
  return c;
}
