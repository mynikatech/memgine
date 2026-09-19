import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { services } from "@/src/core/services/service-registry";
import type { CustomerProfile } from "@/src/core/services/customer-data-service";
import { useAuth } from "./AuthProvider";

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
  /** Canonical User ID from the authenticated customer session. */
  customerId: string;
  profiles: CustomerProfile[];
  customersLoading: boolean;
  customersError: string | null;
  refreshCustomers: () => Promise<void>;
  setActiveContext: (organizationId: string, subscriptionId: string) => void;
  clearActiveContext: () => void;
  /** Switch the selected subscription WITHIN the current organization. */
  setActiveSubscription: (subscriptionId: string) => void;
  /** Semantic alias: entering a selected business (+ subscription) context. */
  enterBusiness: (organizationId: string, subscriptionId: string) => void;
  /** Semantic alias: returning to the Memgine platform "Your Memberships". */
  exitBusiness: () => void;
};

const CustomerCtx = createContext<CustomerContextValue | null>(null);

export function CustomerContextProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [ctx, setCtx] = useState<ActiveCustomerContext>({
    organizationId: null,
    subscriptionId: null,
  });
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

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
  const refreshCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const rows = await services.customerData.profiles();
      setProfiles(rows);
    } catch (error) {
      setCustomersError(error instanceof Error ? error.message : "Unable to load customers.");
      setProfiles([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setProfiles([]);
      clearActiveContext();
      return;
    }
    void refreshCustomers();
  }, [session, refreshCustomers, clearActiveContext]);

  const value = useMemo<CustomerContextValue>(
    () => ({
      ...ctx,
      customerId: session?.userId ?? "",
      profiles,
      customersLoading,
      customersError,
      refreshCustomers,
      setActiveContext,
      clearActiveContext,
      setActiveSubscription,
      enterBusiness: setActiveContext,
      exitBusiness: clearActiveContext,
    }),
    [ctx, session, profiles, customersLoading, customersError, refreshCustomers,
      setActiveContext, clearActiveContext, setActiveSubscription],
  );

  return <CustomerCtx.Provider value={value}>{children}</CustomerCtx.Provider>;
}

export function useCustomerContext(): CustomerContextValue {
  const c = useContext(CustomerCtx);
  if (!c) throw new Error("useCustomerContext must be used within a CustomerContextProvider");
  return c;
}
