import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { services } from "@/src/core/services/service-registry";
import type { CustomerChoice, CustomerProfile } from "@/src/core/services/customer-data-service";

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
  /** Canonical User ID selected by the temporary Local/Dev customer selector. */
  customerId: string;
  customerChoices: CustomerChoice[];
  profiles: CustomerProfile[];
  customersLoading: boolean;
  customersError: string | null;
  refreshCustomers: () => Promise<void>;
  setActiveContext: (organizationId: string, subscriptionId: string) => void;
  clearActiveContext: () => void;
  /** Switch the selected subscription WITHIN the current organization. */
  setActiveSubscription: (subscriptionId: string) => void;
  /** Switch the Local/Dev customer identity across all Customer screens. */
  setActiveCustomer: (customerId: string) => void;
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
  const [customerId, setCustomerId] = useState<string>("");
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [customerChoices, setCustomerChoices] = useState<CustomerChoice[]>([]);
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
  const setActiveCustomer = useCallback((id: string) => {
    setCustomerId(id);
    setCtx({ organizationId: null, subscriptionId: null });
  }, []);
  const refreshCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const rows = await services.customerData.choices();
      setCustomerChoices(rows);
      setCustomerId((current) => current && rows.some((row) => row.userId === current)
        ? current : (rows[0]?.userId ?? ""));
    } catch (error) {
      setCustomersError(error instanceof Error ? error.message : "Unable to load customers.");
      setProfiles([]);
      setCustomerChoices([]);
      setCustomerId("");
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customerId) { setProfiles([]); return; }
    let active = true;
    setCustomersLoading(true);
    setCustomersError(null);
    services.customerData.profiles(customerId).then((rows) => {
      if (!active) return;
      setProfiles(rows);
      const profile = rows[0];
      if (profile) setCustomerChoices((current) => current.some((item) => item.userId === customerId)
        ? current : [...current, { userId: customerId,
          displayName: profile.displayName?.trim() ||
            [profile.firstName, profile.lastName].filter(Boolean).join(" ") }]);
    }).catch((error: unknown) => {
      if (active) { setProfiles([]); setCustomersError(error instanceof Error ? error.message : "Unable to load customer."); }
    }).finally(() => { if (active) setCustomersLoading(false); });
    return () => { active = false; };
  }, [customerId]);

  const value = useMemo<CustomerContextValue>(
    () => ({
      ...ctx,
      customerId,
      customerChoices,
      profiles,
      customersLoading,
      customersError,
      refreshCustomers,
      setActiveContext,
      clearActiveContext,
      setActiveSubscription,
      setActiveCustomer,
      enterBusiness: setActiveContext,
      exitBusiness: clearActiveContext,
    }),
    [ctx, customerId, customerChoices, profiles, customersLoading, customersError, refreshCustomers,
      setActiveContext, clearActiveContext, setActiveSubscription, setActiveCustomer],
  );

  return <CustomerCtx.Provider value={value}>{children}</CustomerCtx.Provider>;
}

export function useCustomerContext(): CustomerContextValue {
  const c = useContext(CustomerCtx);
  if (!c) throw new Error("useCustomerContext must be used within a CustomerContextProvider");
  return c;
}
