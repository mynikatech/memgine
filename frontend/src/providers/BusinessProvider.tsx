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
   * Existing legacy organizations may still be served by
   * BUSINESS_CONTEXTS during this migration.
   *
   * Newly-created organizations MUST resolve through the
   * new persisted organization/API path.
   */
  useEffect(() => {
    if (organizationId) {
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      /*
       * Existing legacy organizations can still be resolved directly
       * from the legacy business-context registry.
       */
      const legacy = BUSINESS_CONTEXTS[activeOrgId];

      if (legacy) {
        if (cancelled) {
          return;
        }

        setResolvedContext(legacy);
        setResolving(false);
        return;
      }

      setResolving(true);

      try {
        const context = await resolveOrganizationContext(activeOrgId);

        if (cancelled) {
          return;
        }

        if (context) {
          setResolvedContext(context);
          setResolving(false);
          return;
        }

        /*
         * The persisted active organization may no longer exist.
         *
         * This can happen during development when local organization
         * data is reset, and in production if an organization is
         * deactivated/deleted while a user still has it as their
         * active organization.
         *
         * Fall back to the default valid organization instead of
         * crashing the entire application.
         */
        if (activeOrgId !== DEFAULT_ACTIVE_ORG_ID) {
          console.warn(
            `[BusinessProvider] active organization '${activeOrgId}' could not be resolved. ` +
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
          `Default active organization '${DEFAULT_ACTIVE_ORG_ID}' could not be resolved.`,
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
         * If the stored organization became invalid, recover by using
         * the default organization rather than leaving the application
         * permanently stuck on an invalid tenant.
         */
        if (activeOrgId !== DEFAULT_ACTIVE_ORG_ID) {
          console.warn(
            `[BusinessProvider] recovering from invalid active organization '${activeOrgId}'. ` +
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
