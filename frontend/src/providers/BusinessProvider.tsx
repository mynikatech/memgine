import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BusinessConfiguration,
  BUSINESS_CONTEXTS,
  DEFAULT_ACTIVE_ORG_ID,
  DEFAULT_ROLE_CAPABILITIES,
  Capability,
  hasCapability,
  ID,
  LocaleProfile,
  LocalizationContext,
  ManagementModel,
  OrganizationAccount,
  PlanTier,
  Principal,
  StaffRole,
  TemplateDefinition,
  toFormattingContext,
} from "@/src/core";

import { activeOrganizationStore } from "@/src/data/persistence/session/active-organization-store";

import { resolveOrganizationContext } from "@/src/core/organization/organization-context-resolver";

import { buildTheme, Theme } from "@/src/theme/theme";

type Entitlements = {
  planTier: PlanTier;
  managementModel: ManagementModel;
};

type BusinessContextValue = {
  organization: ReturnType<
    typeof getBusinessContextFromRegistry
  >["organization"];
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

export type BusinessProviderOverrides = {
  organizationId?: ID;
  configuration?: BusinessConfiguration;
  template?: TemplateDefinition;
};

function getBusinessContextFromRegistry(organizationId: ID) {
  const context = BUSINESS_CONTEXTS[organizationId];

  if (!context) {
    throw new Error(
      `Legacy business context '${organizationId}' could not be resolved.`,
    );
  }

  return context;
}

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

  const [resolvedContext, setResolvedContext] = useState<ReturnType<
    typeof getBusinessContextFromRegistry
  > | null>(() => {
    const initialId = organizationId ?? DEFAULT_ACTIVE_ORG_ID;

    return BUSINESS_CONTEXTS[initialId] ?? null;
  });

  const [resolving, setResolving] = useState(
    !BUSINESS_CONTEXTS[organizationId ?? DEFAULT_ACTIVE_ORG_ID],
  );

  /*
   * Restore the last active organization from
   * session persistence.
   *
   * Explicit preview providers never participate
   * in application active-organization state.
   */
  useEffect(() => {
    if (organizationId) {
      return;
    }

    let cancelled = false;

    void activeOrganizationStore
      .get()
      .then((storedId) => {
        if (cancelled || !storedId || storedId === activeOrgId) {
          return;
        }

        setActiveOrgId(storedId);
      })
      .catch((error) => {
        console.error(
          "[BusinessProvider] active organization restore failed:",
          error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  /*
   * Resolve the current organization.
   *
   * Persisted organization/API data is the source of truth.
   * This is important for customer-facing screens because
   * organization branding/logo changes made in Org Admin are
   * stored in persisted organization configuration.
   *
   * BUSINESS_CONTEXTS remains a fallback for legacy/demo
   * organizations that do not have a persisted organization
   * context.
   *
   * IMPORTANT:
   * Explicit BusinessPreviewScope providers also resolve their
   * supplied organizationId here. Previously this effect returned
   * immediately whenever organizationId was supplied, leaving
   * resolvedContext null for persisted organizations and causing
   * the preview/customer renderer to remain blank.
   */
  useEffect(() => {
    let cancelled = false;

    const targetOrganizationId = organizationId ?? activeOrgId;

    const resolve = async () => {
      setResolving(true);

      try {
        /*
         * Resolve persisted organization data FIRST.
         *
         * This applies both to the normal provider and to an
         * explicit preview provider with organizationId.
         */
        const context = await resolveOrganizationContext(targetOrganizationId);

        if (cancelled) {
          return;
        }

        if (context) {
          setResolvedContext(context);
          setResolving(false);
          return;
        }

        /*
         * Legacy fallback.
         */
        const legacy = BUSINESS_CONTEXTS[targetOrganizationId];

        if (legacy) {
          setResolvedContext(legacy);
          setResolving(false);
          return;
        }

        /*
         * Only the normal provider may change the active organization
         * as a recovery mechanism. An explicit preview provider must
         * never change application-wide active-organization state.
         */
        if (!organizationId && targetOrganizationId !== DEFAULT_ACTIVE_ORG_ID) {
          console.warn(
            `[BusinessProvider] active organization '${targetOrganizationId}' could not be resolved. ` +
              `Falling back to '${DEFAULT_ACTIVE_ORG_ID}'.`,
          );

          setActiveOrgId(DEFAULT_ACTIVE_ORG_ID);

          void activeOrganizationStore
            .set(DEFAULT_ACTIVE_ORG_ID)
            .catch((error) => {
              console.error(
                "[BusinessProvider] fallback organization persistence failed:",
                error,
              );
            });

          return;
        }

        throw new Error(
          `Organization '${targetOrganizationId}' could not be resolved.`,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "[BusinessProvider] organization resolution failed:",
          error,
        );

        /*
         * Only the normal provider may recover by changing the
         * application active organization. Preview providers must
         * remain isolated from session state.
         */
        if (!organizationId && targetOrganizationId !== DEFAULT_ACTIVE_ORG_ID) {
          console.warn(
            `[BusinessProvider] recovering from invalid active organization '${targetOrganizationId}'. ` +
              `Using '${DEFAULT_ACTIVE_ORG_ID}'.`,
          );

          setActiveOrgId(DEFAULT_ACTIVE_ORG_ID);

          void activeOrganizationStore
            .set(DEFAULT_ACTIVE_ORG_ID)
            .catch((persistError) => {
              console.error(
                "[BusinessProvider] fallback organization persistence failed:",
                persistError,
              );
            });

          return;
        }

        /*
         * Final legacy fallback for the default/explicit organization.
         */
        const legacy = BUSINESS_CONTEXTS[targetOrganizationId];

        if (legacy) {
          setResolvedContext(legacy);
          setResolving(false);
          return;
        }

        setResolvedContext(null);
        setResolving(false);
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, organizationId]);

  const resolvedOrgId = organizationId ?? activeOrgId;

  /*
   * Preview providers continue to use their explicitly
   * supplied context. Normal providers use the resolved
   * persisted/legacy context.
   */
  const value = useMemo<BusinessContextValue | null>(() => {
    if (!resolvedContext) {
      return null;
    }

    const {
      organization,
      account,
      configuration: baseConfiguration,
      template: baseTemplate,
    } = resolvedContext;

    const configuration = configurationOverride ?? baseConfiguration;

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

      setActiveBusiness: organizationId
        ? () => undefined
        : (nextOrganizationId) => {
            setActiveOrgId(nextOrganizationId);

            void activeOrganizationStore
              .set(nextOrganizationId)
              .catch((error) => {
                console.error(
                  "[BusinessProvider] active organization persistence failed:",
                  error,
                );
              });
          },
    };
  }, [
    resolvedContext,
    configurationOverride,
    templateOverride,
    organizationId,
  ]);

  /*
   * We deliberately don't throw just because a newly-created
   * organization isn't present in the legacy registry.
   */
  if (!value) {
    if (resolving) {
      return null;
    }

    throw new Error(
      `Active organization '${resolvedOrgId}' could not be resolved.`,
    );
  }

  return <BusinessCtx.Provider value={value}>{children}</BusinessCtx.Provider>;
}

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
