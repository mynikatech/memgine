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

/**
 * Optional overrides used by the Customer Experience preview.
 *
 * Normal application usage continues to resolve the organization from
 * BUSINESS_CONTEXTS.
 *
 * Preview usage can provide:
 *
 *   organizationId
 *   configuration
 *   template
 *
 * so that two independent BusinessExperience instances can be rendered
 * simultaneously.
 */
export type BusinessProviderOverrides = {
  organizationId?: ID;
  configuration?: BusinessConfiguration;
  template?: TemplateDefinition;
};

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

export function BusinessProvider({
  children,
  organizationId,
  configuration: configurationOverride,
  template: templateOverride,
}: {
  children: ReactNode;
} & BusinessProviderOverrides) {
  const [activeOrgId, setActiveOrgId] = useState<ID>(
    organizationId ?? DEFAULT_ACTIVE_ORG_ID,
  );

  /**
   * When an organizationId is explicitly supplied, the provider is being
   * used as an isolated business context, typically by the Customer
   * Experience preview.
   *
   * In that case setActiveBusiness is intentionally scoped to this provider.
   */
  const resolvedOrgId = organizationId ?? activeOrgId;

  const value = useMemo<BusinessContextValue>(() => {
    const ctx = BUSINESS_CONTEXTS[resolvedOrgId];

    if (!ctx) {
      throw new Error(
        `Active organization '${resolvedOrgId}' could not be resolved.`,
      );
    }

    const {
      organization,
      account,
      configuration: baseConfiguration,
      template: baseTemplate,
    } = ctx;

    /**
     * Configuration override is used by the Proposed Customer Experience
     * preview.
     *
     * Normal runtime usage continues to use the persisted/mock business
     * configuration unchanged.
     */
    const configuration = configurationOverride ?? baseConfiguration;

    /**
     * Template remains Memgine-controlled.
     *
     * A business/customer experience can configure within a template but
     * cannot replace the template itself.
     */
    const template = templateOverride ?? baseTemplate;

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

      /**
       * For a normal provider this changes the active business.
       *
       * For an isolated preview provider, the component should simply
       * remain scoped to its supplied organization.
       */
      setActiveBusiness: organizationId ? () => undefined : setActiveOrgId,
    };
  }, [resolvedOrgId, configurationOverride, templateOverride]);

  return <BusinessCtx.Provider value={value}>{children}</BusinessCtx.Provider>;
}

/**
 * Convenience wrapper for isolated Customer Experience previews.
 *
 * This is intentionally separate from normal application navigation so the
 * preview cannot accidentally change the application's active business.
 */
export function BusinessPreviewScope({
  organizationId,
  configuration,
  template,
  children,
}: {
  organizationId: ID;
  configuration?: BusinessConfiguration;
  template?: TemplateDefinition;
  children: ReactNode;
}) {
  return (
    <BusinessProvider
      organizationId={organizationId}
      configuration={configuration}
      template={template}
    >
      {children}
    </BusinessProvider>
  );
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
