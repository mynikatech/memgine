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
  services,
  StaffRole,
  TemplateDefinition,
  toFormattingContext,
} from "@/src/core";

import { buildTheme, Theme } from "@/src/theme/theme";

type Entitlements = {
  planTier: PlanTier;
  managementModel: ManagementModel;
};

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

  setActiveBusiness: (organizationId: ID) => void;
};

const BusinessCtx = createContext<BusinessContextValue | null>(null);

const ThemeOverrideCtx = createContext<Theme | null>(null);

export function BusinessThemeScope({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <ThemeOverrideCtx.Provider value={theme}>
      {children}
    </ThemeOverrideCtx.Provider>
  );
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [activeOrgId, setActiveOrgId] = useState<ID>(DEFAULT_ACTIVE_ORG_ID);

  const value = useMemo<BusinessContextValue>(() => {
    const ctx = BUSINESS_CONTEXTS[activeOrgId];

    if (!ctx) {
      throw new Error(
        `Active organization '${activeOrgId}' could not be resolved.`,
      );
    }

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

      entitlements: {
        planTier: account.planTier,

        managementModel: account.managementModel,
      },

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

  if (!ctx) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }

  return ctx;
}

export function useTheme(): Theme {
  const override = useContext(ThemeOverrideCtx);

  const business = useBusiness();

  return override ?? business.theme;
}

export function useCan(capability: Capability): boolean {
  return useBusiness().can(capability);
}
