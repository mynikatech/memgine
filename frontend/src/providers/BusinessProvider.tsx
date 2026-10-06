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
  BusinessContext,
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

import { ActivityIndicator, StyleSheet, View } from "react-native";

import { activeOrganizationStore } from "@/src/data/persistence/session/active-organization-store";
import { useAuth } from "@/src/providers/AuthProvider";

import { resolveOrganizationContext } from "@/src/core/organization/organization-context-resolver";

import { buildTheme, Theme } from "@/src/theme/theme";

type Entitlements = {
  planTier: PlanTier;
  managementModel: ManagementModel;
};

type BusinessContextValue = {
  organization: BusinessContext["organization"];
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
type ActiveBusinessControlValue = {
  setActiveBusiness: (organizationId: ID) => void;
};

const ActiveBusinessControlCtx =
  createContext<ActiveBusinessControlValue | null>(null);

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
  const { session, loading: sessionLoading } = useAuth();

  const sessionOrganizationIds = useMemo(
    () =>
      new Set(
        session?.access
          .map((context) => context.organizationId)
          .filter((id): id is ID => Boolean(id)) ?? [],
      ),
    [session],
  );

  const sessionOrganizationId =
    session?.posContext?.organizationId ??
    session?.access.find((context) => context.organizationId)?.organizationId ??
    null;

  const [activeOrgId, setActiveOrgId] = useState<ID | null>(
    organizationId ?? null,
  );

  const activeBusinessControl = useMemo<ActiveBusinessControlValue>(
    () => ({
      setActiveBusiness: (nextOrganizationId) => {
        setActiveOrgId(nextOrganizationId);

        void activeOrganizationStore.set(nextOrganizationId).catch((error) => {
          console.error(
            "[BusinessProvider] active organization persistence failed:",
            error,
          );
        });
      },
    }),
    [],
  );

  const authenticatedWithoutOrganizationContext =
    !sessionLoading &&
    !!session &&
    !organizationId &&
    !activeOrgId &&
    !sessionOrganizationId;

  const [resolvedContext, setResolvedContext] =
    useState<BusinessContext | null>(null);

  const [resolving, setResolving] = useState(true);

  /*
   * Restore the last active organization from session persistence.
   *
   * If the persisted organization no longer belongs to the
   * authenticated session, use the organization's session access
   * context instead.
   */
  useEffect(() => {
    if (organizationId || sessionLoading) {
      return;
    }

    let cancelled = false;

    void activeOrganizationStore
      .get()
      .then((storedId) => {
        if (cancelled) {
          return;
        }

        const nextOrganizationId =
          storedId && sessionOrganizationIds.has(storedId)
            ? storedId
            : sessionOrganizationId;

        if (nextOrganizationId && nextOrganizationId !== activeOrgId) {
          setActiveOrgId(nextOrganizationId);
        }
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
  }, [
    activeOrgId,
    organizationId,
    sessionLoading,
    sessionOrganizationId,
    sessionOrganizationIds,
  ]);

  /*
   * Resolve the current organization.
   *
   * Explicit organizationId is used for preview providers.
   * Normal application providers use the active organization,
   * falling back to the authenticated session organization.
   */
  useEffect(() => {
    let cancelled = false;

    const targetOrganizationId =
      organizationId ?? activeOrgId ?? sessionOrganizationId;

    if (sessionLoading) {
      setResolving(true);
      return;
    }

    if (!targetOrganizationId) {
      setResolvedContext(null);
      setResolving(false);
      return;
    }

    const resolve = async () => {
      setResolving(true);

      try {
        const context = await resolveOrganizationContext(targetOrganizationId);

        if (cancelled) {
          return;
        }

        if (context) {
          setResolvedContext(context);
          setResolving(false);
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

        setResolvedContext(null);
        setResolving(false);
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, organizationId, sessionLoading, sessionOrganizationId]);

  /*
   * Preview providers continue to use their explicitly supplied
   * context. Normal providers use the resolved persisted context.
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

    // Organization context is not proof of an effective role assignment.
    // Authentication will supply server-resolved capabilities to this principal.
    const capabilities: Capability[] = [];

    const principal: Principal = {
      kind: "STAFF",
      staffId: "staff-dev-owner",
      organizationId: organization.id,
      role: StaffRole.ORG_ADMIN,
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

  const styles = StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
  });

  /*
   * Do not crash the application while the authenticated
   * organization context is unavailable.
   *
   * There is deliberately no mock/default organization fallback.
   */

  if (!sessionLoading && !session && !organizationId) {
    return <>{children}</>;
  }

  if (authenticatedWithoutOrganizationContext) {
    return (
      <ActiveBusinessControlCtx.Provider value={activeBusinessControl}>
        {children}
      </ActiveBusinessControlCtx.Provider>
    );
  }

  if (resolving || !value) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ActiveBusinessControlCtx.Provider value={activeBusinessControl}>
      <BusinessCtx.Provider value={value}>{children}</BusinessCtx.Provider>
    </ActiveBusinessControlCtx.Provider>
  );
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

export function useActiveBusinessControl(): ActiveBusinessControlValue {
  const ctx = useContext(ActiveBusinessControlCtx);

  if (!ctx) {
    throw new Error(
      "useActiveBusinessControl must be used within a BusinessProvider",
    );
  }

  return ctx;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessCtx);

  if (!ctx) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }

  return ctx;
}

export function useOptionalBusiness(): BusinessContextValue | null {
  return useContext(BusinessCtx);
}

export function useTheme(): Theme {
  const override = useContext(ThemeOverrideCtx);

  if (override) {
    return override;
  }

  const business = useContext(BusinessCtx);

  if (business) {
    return business.theme;
  }

  return buildTheme(undefined);
}

export function useCan(capability: Capability): boolean {
  return useBusiness().can(capability);
}
