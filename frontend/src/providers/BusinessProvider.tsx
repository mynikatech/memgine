import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import {
  BusinessConfiguration,
  BUSINESS_CONTEXTS,
  Capability,
  DEFAULT_ACTIVE_ORG_ID,
  DEFAULT_ROLE_CAPABILITIES,
  hasCapability,
  ID,
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
  /** Switch the active business (org) so branding/template/locale follow it. */
  setActiveBusiness: (organizationId: ID) => void;
};

const BusinessCtx = createContext<BusinessContextValue | null>(null);

/**
 * Per-subtree theme override. Lets a screen render a SPECIFIC business's brand
 * theme for part of the tree (e.g. each card on "Your Memberships") WITHOUT
 * changing the globally active business. Absent by default, so normal screens
 * keep using the active business theme.
 */
const ThemeOverrideCtx = createContext<Theme | null>(null);

export function BusinessThemeScope({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeOverrideCtx.Provider value={theme}>{children}</ThemeOverrideCtx.Provider>;
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  // Which business the app is currently presenting. Defaults to the demo
  // Sunrise Bakery; entering a membership switches it to that membership's org.
  const [activeOrgId, setActiveOrgId] = useState<ID>(DEFAULT_ACTIVE_ORG_ID);

  const value = useMemo<BusinessContextValue>(() => {
    const ctx = BUSINESS_CONTEXTS[activeOrgId] ?? SUNRISE_BAKERY_CONTEXT;
    const { organization, account, configuration, template } = ctx;

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
      setActiveBusiness: setActiveOrgId,
    };
  }, [activeOrgId]);

  return <BusinessCtx.Provider value={value}>{children}</BusinessCtx.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessCtx);
  if (!ctx) throw new Error("useBusiness must be used within a BusinessProvider");
  return ctx;
}

/** The active theme (business-branded), or a per-subtree override if present. */
export function useTheme(): Theme {
  const override = useContext(ThemeOverrideCtx);
  const business = useBusiness();
  return override ?? business.theme;
}

/** Capability check helper. */
export function useCan(capability: Capability): boolean {
  return useBusiness().can(capability);
}
