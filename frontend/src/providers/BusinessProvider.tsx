import { createContext, ReactNode, useContext, useMemo } from "react";

import {
  BusinessConfiguration,
  Capability,
  DEFAULT_ROLE_CAPABILITIES,
  hasCapability,
  LocaleProfile,
  LocalizationContext,
  ManagementModel,
  Organization,
  OrganizationAccount,
  PlanTier,
  Principal,
  StaffRole,
  SUNRISE_BAKERY_CONTEXT,
  TemplateDefinition,
  toFormattingContext,
} from "@/src/core";
import { buildTheme, Theme } from "@/src/theme/theme";

/**
 * BusinessProvider — the single context layer that surfaces the frozen Stage 2A
 * contracts to the UI. Components must read business config / theme / locale /
 * capabilities from here rather than importing hard-coded business values.
 *
 * Defaults to the mock Sunrise Bakery Café/Bakery context for development.
 */
type Entitlements = { planTier: PlanTier; managementModel: ManagementModel };

type BusinessContextValue = {
  organization: Organization;
  account: OrganizationAccount;
  configuration: BusinessConfiguration;
  template: TemplateDefinition;
  entitlements: Entitlements;
  theme: Theme;
  localization: LocalizationContext;
  principal: Principal;
  capabilities: Capability[];
  can: (capability: Capability) => boolean;
};

const BusinessCtx = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const value = useMemo<BusinessContextValue>(() => {
    const { organization, account, configuration, template } = SUNRISE_BAKERY_CONTEXT;

    const theme = buildTheme(configuration.branding);

    const active: LocaleProfile = {
      language: configuration.localization.defaultLanguage,
      currency: configuration.localization.defaultCurrency,
      timezone: configuration.localization.timezone,
    };
    const localization: LocalizationContext = {
      active,
      formatting: toFormattingContext(active),
      isRTL: false,
      availableLanguages: ["en"],
    };

    // Development default principal: a staff OWNER for the mock org.
    const capabilities = DEFAULT_ROLE_CAPABILITIES[StaffRole.OWNER];
    const principal: Principal = {
      kind: "STAFF",
      staffId: "staff-dev-owner",
      organizationId: organization.id,
      role: StaffRole.OWNER,
      capabilities,
    };

    return {
      organization,
      account,
      configuration,
      template,
      entitlements: { planTier: account.planTier, managementModel: account.managementModel },
      theme,
      localization,
      principal,
      capabilities,
      can: (capability: Capability) => hasCapability(principal, capability),
    };
  }, []);

  return <BusinessCtx.Provider value={value}>{children}</BusinessCtx.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessCtx);
  if (!ctx) throw new Error("useBusiness must be used within a BusinessProvider");
  return ctx;
}

/** The active theme (business-branded). */
export function useTheme(): Theme {
  return useBusiness().theme;
}

/** Capability check helper. */
export function useCan(capability: Capability): boolean {
  return useBusiness().can(capability);
}
