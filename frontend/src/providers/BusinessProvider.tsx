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
  onboardOrganization,
} from "@/src/core";

import { buildTheme, Theme } from "@/src/theme/theme";

type Entitlements = {
  planTier: PlanTier;
  managementModel: ManagementModel;
};

type OnboardBusinessInput = {
  name: string;
  organizationType: string;
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

  /**
   * Switch the active organization.
   */
  setActiveBusiness: (organizationId: ID) => void;

  /**
   * Create a new organization from a
   * platform-level default template.
   */
  onboardBusiness: (input: OnboardBusinessInput) => Promise<Organization>;
};

const BusinessCtx = createContext<BusinessContextValue | null>(null);

/**
 * Per-subtree theme override.
 *
 * Allows a specific business to render using its
 * own branding without changing the globally active
 * organization.
 */
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
  /*
   * Current default organization for the demo.
   *
   * This controls the organization shown when the app
   * initially opens.
   *
   * It is NOT used as an onboarding template.
   */
  const [activeOrgId, setActiveOrgId] = useState<ID>(DEFAULT_ACTIVE_ORG_ID);

  /**
   * Onboard a new business.
   *
   * The onboarding service selects the appropriate
   * platform template based on organization type.
   *
   * After successful creation the new organization
   * becomes the active organization.
   */
  const onboardBusiness = async (
    input: OnboardBusinessInput,
  ): Promise<Organization> => {
    const result = await onboardOrganization(input);

    setActiveOrgId(result.organization.id);

    return result.organization;
  };

  const value = useMemo<BusinessContextValue>(() => {
    /*
     * Resolve the active organization's context.
     *
     * The new organization has already been registered
     * by onboardOrganization(), so it can be resolved here.
     *
     * The Sunrise fallback exists only as a defensive
     * development fallback for an invalid/unknown ID.
     */
    const ctx = BUSINESS_CONTEXTS[activeOrgId] ?? SUNRISE_BAKERY_CONTEXT;

    const { organization, account, configuration, template } = ctx;

    /*
     * Build business-branded theme.
     */
    const theme = buildTheme(configuration.branding);

    /*
     * Business localization.
     */
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

    /*
     * Current development principal.
     *
     * This remains the OWNER used by the UI until
     * authentication/Platform Admin identity is connected
     * to the backend.
     */
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

      onboardBusiness,
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

/**
 * Returns the active business theme,
 * or a subtree-specific override.
 */
export function useTheme(): Theme {
  const override = useContext(ThemeOverrideCtx);

  const business = useBusiness();

  return override ?? business.theme;
}

/**
 * Capability check helper.
 */
export function useCan(capability: Capability): boolean {
  return useBusiness().can(capability);
}
