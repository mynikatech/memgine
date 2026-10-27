import { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import type {
  CommercePaymentProviderRoute,
  CommercePaymentProviderRouteWrite,
  CommerceStoreCatalogSource,
  CommerceStoreCatalogSourceConfiguration,
  IntegrationConfiguration,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { createEmptyIntegrationConfiguration, services } from "@/src/core";

import { CommercePaymentProviderRouteApi } from "@/src/data/api/commerce-payment-provider-route-api";

import { CommerceStoreCatalogSourceApi } from "@/src/data/api/commerce-store-catalog-source-api";

import {
  organizationPoyntPaymentApi,
  type OrganizationPoyntPaymentSummary,
} from "@/src/data/api/platform-poynt-payment-api";

import { useBusiness } from "@/src/providers";

import { Modal, ReferenceSelect, Text } from "@/src/ui";

import { CommercePaymentProviderRouteForm } from "@/src/ui/admin/CommercePaymentProviderRouteForm";

import { IntegrationConfigurationForm } from "@/src/ui/admin/IntegrationConfigurationForm";

import { PoyntStoreTerminalManager } from "@/src/ui/admin/PoyntStoreTerminalManager";

const poyntCapabilities =
  "Product Catalog · Counter Payment · Customer Payment";

const ROUTE_FORM_MODAL_TRANSITION_MS = 250;

export default function Integrations() {
  const { organization } = useBusiness();

  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>(
    [],
  );

  const [committedIntegrations, setCommittedIntegrations] = useState<
    IntegrationConfiguration[]
  >([]);

  const [integrationTypes, setIntegrationTypes] = useState<ReferenceDataItem[]>(
    [],
  );

  const [statuses, setStatuses] = useState<Status[]>([]);

  const [paymentRoutes, setPaymentRoutes] = useState<
    CommercePaymentProviderRoute[]
  >([]);

  const [stores, setStores] = useState<Store[]>([]);

  const [poyntSummaries, setPoyntSummaries] = useState<
    OrganizationPoyntPaymentSummary[]
  >([]);

  const [detailsIntegrationId, setDetailsIntegrationId] = useState<
    string | null
  >(null);

  const [terminalSummary, setTerminalSummary] =
    useState<OrganizationPoyntPaymentSummary | null>(null);

  const [terminalIntegrationTypeId, setTerminalIntegrationTypeId] =
    useState("");

  const [paymentRouteVisible, setPaymentRouteVisible] = useState(false);

  const [editingPaymentRoute, setEditingPaymentRoute] =
    useState<CommercePaymentProviderRoute | null>(null);

  const [viewingPaymentRoute, setViewingPaymentRoute] = useState(false);

  const [savingPaymentRoute, setSavingPaymentRoute] = useState(false);

  const [paymentRouteScope, setPaymentRouteScope] = useState<{
    storeId: string | null;

    sourceChannel?: "COUNTER" | "CUSTOMER";
  } | null>(null);

  const [organizationDefaultsVisible, setOrganizationDefaultsVisible] =
    useState(false);

  const [paymentRouteFormOrigin, setPaymentRouteFormOrigin] = useState<
    "ORGANIZATION_DEFAULTS" | null
  >(null);

  const [selectedCapabilityStoreId, setSelectedCapabilityStoreId] =
    useState("");

  const [catalogSource, setCatalogSource] =
    useState<CommerceStoreCatalogSourceConfiguration | null>(null);

  const [catalogSourceLoading, setCatalogSourceLoading] = useState(false);

  const [catalogSourceError, setCatalogSourceError] = useState<string | null>(
    null,
  );

  const [catalogSourceVisible, setCatalogSourceVisible] = useState(false);

  const [selectedCatalogIntegrationId, setSelectedCatalogIntegrationId] =
    useState("");

  const [savingCatalogSource, setSavingCatalogSource] = useState(false);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [formVisible, setFormVisible] = useState(false);

  const [editingIntegration, setEditingIntegration] =
    useState<IntegrationConfiguration | null>(null);

  const [isViewing, setIsViewing] = useState(false);

  const [saving, setSaving] = useState(false);

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { width } = useWindowDimensions();

  const isMobile = width < 700;

  const paymentRouteApi = useMemo(
    () => new CommercePaymentProviderRouteApi(),

    [],
  );

  const catalogSourceApi = useMemo(
    () => new CommerceStoreCatalogSourceApi(),

    [],
  );

  const catalogSourceRequestVersion = useRef(0);

  const paymentRouteModalTransitionTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const allowTestPaymentProvider = process.env.EXPO_PUBLIC_APP_ENV !== "prod";

  const poyntSummaryByIntegrationId = useMemo(
    () =>
      new Map(
        poyntSummaries.map((summary) => [
          summary.integrationConfigurationId,

          summary,
        ]),
      ),

    [poyntSummaries],
  );

  const activeIntegrationStatusId = useMemo(
    () =>
      statuses.find(
        (status) => status.statusCode?.trim().toUpperCase() === "ACTIVE",
      )?.id ?? "",

    [statuses],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      setError(null);

      try {
        const [
          integrationList,

          typeList,

          statusList,

          routeResult,

          storeList,

          poyntResult,
        ] = await Promise.all([
          services.organization.listIntegrationConfigurations(organization.id),

          services.referenceData.listIntegrationTypes(),

          services.status.listIntegrationConfigurationStatuses(),

          paymentRouteApi.list(organization.id),

          services.organization.listStores(organization.id),

          organizationPoyntPaymentApi.summaries(organization.id),
        ]);

        if (!routeResult.success) throw new Error(routeResult.error.message);

        if (!poyntResult.success) throw new Error(poyntResult.error.message);

        if (!mounted) {
          return;
        }

        const visibleIntegrations = integrationList.filter(
          (item) => !item.isDeleted,
        );

        setIntegrations(visibleIntegrations);

        setCommittedIntegrations(visibleIntegrations);

        setIntegrationTypes(typeList);

        setStatuses(statusList);

        setPaymentRoutes(routeResult.data.filter((route) => !route.isDeleted));

        const activeStores = storeList.filter((store) => !store.isDeleted);

        setStores(activeStores);

        setSelectedCapabilityStoreId(
          (current) => current || activeStores[0]?.id || "",
        );

        setPoyntSummaries(poyntResult.data);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load integrations.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id, paymentRouteApi]);

  useEffect(
    () => () => {
      if (paymentRouteModalTransitionTimer.current) {
        clearTimeout(paymentRouteModalTransitionTimer.current);
      }
    },

    [],
  );

  useEffect(() => {
    if (!selectedCapabilityStoreId) {
      setCatalogSource(null);

      setCatalogSourceError(null);

      return;
    }

    const version = ++catalogSourceRequestVersion.current;

    setCatalogSourceLoading(true);

    setCatalogSourceError(null);

    void catalogSourceApi

      .get(organization.id, selectedCapabilityStoreId)

      .then((result) => {
        if (version !== catalogSourceRequestVersion.current) return;

        if (!result.success) throw new Error(result.error.message);

        setCatalogSource(result.data);
      })

      .catch((loadError: unknown) => {
        if (version !== catalogSourceRequestVersion.current) return;

        setCatalogSource(null);

        setCatalogSourceError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Store catalog configuration.",
        );
      })

      .finally(() => {
        if (version === catalogSourceRequestVersion.current) {
          setCatalogSourceLoading(false);
        }
      });
  }, [catalogSourceApi, organization.id, selectedCapabilityStoreId]);

  useEffect(() => {
    setCatalogSourceVisible(false);

    setSelectedCatalogIntegrationId("");
  }, [selectedCapabilityStoreId]);

  const getTypeName = (id: string) =>
    integrationTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStatusName = (id: string) =>
    statuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  const routeIntegrations = useMemo(
    () =>
      integrations.filter(
        (integration) =>
          integration.provider.trim().toUpperCase() !== "POYNT" ||
          poyntSummaryByIntegrationId.get(integration.id)?.connectionStatus ===
            "VERIFIED",
      ),

    [integrations, poyntSummaryByIntegrationId],
  );

  const handleStartEditing = () => {
    setIsEditing(true);

    setSaveMessage(null);
  };

  const handleCancel = () => {
    setIntegrations(committedIntegrations);

    setEditingIntegration(null);

    setFormVisible(false);

    setIsViewing(false);

    setIsEditing(false);

    setSaveMessage(null);
  };

  const handleAdd = () => {
    const empty = createEmptyIntegrationConfiguration(
      organization.id,

      "user-system",
    );

    setEditingIntegration({
      ...empty,

      integrationStatusId: activeIntegrationStatusId,
    });

    setIsViewing(false);

    setFormVisible(true);

    setSaveMessage(null);
  };

  const handleView = (configuration: IntegrationConfiguration) => {
    setEditingIntegration({
      ...configuration,
    });

    setIsViewing(true);

    setFormVisible(true);
  };

  const isPlatformManagedPayment = (configuration: IntegrationConfiguration) =>
    ["POYNT", "TEST"].includes(configuration.provider.trim().toUpperCase());

  const handleEdit = (configuration: IntegrationConfiguration) => {
    if (isPlatformManagedPayment(configuration)) {
      Alert.alert(
        "Platform managed",

        "Payment integrations are managed by Memgine Platform Admin.",
      );

      handleView(configuration);

      return;
    }

    setEditingIntegration({
      ...configuration,
    });

    setIsViewing(false);

    setFormVisible(true);

    setSaveMessage(null);
  };

  const handleCloseForm = () => {
    if (saving) {
      return;
    }

    setFormVisible(false);

    setEditingIntegration(null);

    setIsViewing(false);
  };

  const handleSaveDraft = (configuration: IntegrationConfiguration) => {
    if (isPlatformManagedPayment(configuration)) {
      Alert.alert(
        "Platform managed",

        "Payment integrations are managed by Memgine Platform Admin.",
      );

      return;
    }

    setIntegrations((current) => {
      const existing = current.some((item) => item.id === configuration.id);

      if (existing) {
        return current.map((item) =>
          item.id === configuration.id ? configuration : item,
        );
      }

      return [...current, configuration];
    });

    setFormVisible(false);

    setEditingIntegration(null);

    setIsViewing(false);
  };

  const handleDelete = (configuration: IntegrationConfiguration) => {
    if (isPlatformManagedPayment(configuration)) {
      Alert.alert(
        "Platform managed",

        "Payment integrations cannot be removed by Org Admin.",
      );

      return;
    }

    setIntegrations((current) =>
      current.filter((item) => item.id !== configuration.id),
    );

    if (editingIntegration?.id === configuration.id) {
      setEditingIntegration(null);

      setFormVisible(false);

      setIsViewing(false);
    }

    setSaveMessage(null);
  };

  const reloadPaymentRoutes = async () => {
    const result = await paymentRouteApi.list(organization.id);

    if (!result.success) throw new Error(result.error.message);

    setPaymentRoutes(result.data.filter((route) => !route.isDeleted));
  };

  const reloadCatalogSource = async () => {
    if (!selectedCapabilityStoreId) return;

    const version = ++catalogSourceRequestVersion.current;

    setCatalogSourceLoading(true);

    setCatalogSourceError(null);

    try {
      const result = await catalogSourceApi.get(
        organization.id,

        selectedCapabilityStoreId,
      );

      if (version !== catalogSourceRequestVersion.current) return;

      if (!result.success) throw new Error(result.error.message);

      setCatalogSource(result.data);
    } catch (loadError) {
      if (version !== catalogSourceRequestVersion.current) return;

      setCatalogSourceError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Store catalog configuration.",
      );
    } finally {
      if (version === catalogSourceRequestVersion.current) {
        setCatalogSourceLoading(false);
      }
    }
  };

  const routeResolution = (sourceChannel: "COUNTER" | "CUSTOMER") => {
    const storeRoute = paymentRoutes.find(
      (route) =>
        route.storeId === selectedCapabilityStoreId &&
        route.sourceChannel === sourceChannel,
    );

    const organizationDefault = paymentRoutes.find(
      (route) => !route.storeId && route.sourceChannel === sourceChannel,
    );

    const effectiveRoute = storeRoute?.enabled
      ? storeRoute
      : organizationDefault?.enabled
        ? organizationDefault
        : null;

    const configuration = storeRoute
      ? storeRoute.enabled
        ? "Store override"
        : organizationDefault?.enabled
          ? "Store override disabled; organization default"
          : "Store override disabled"
      : organizationDefault?.enabled
        ? "Organization default"
        : "Not configured";

    return { storeRoute, organizationDefault, effectiveRoute, configuration };
  };

  const openStoreRoute = (sourceChannel: "COUNTER" | "CUSTOMER") => {
    if (!selectedCapabilityStoreId) return;

    setPaymentRouteFormOrigin(null);

    setPaymentRouteScope({
      storeId: selectedCapabilityStoreId,

      sourceChannel,
    });

    setEditingPaymentRoute(routeResolution(sourceChannel).storeRoute ?? null);

    setViewingPaymentRoute(false);

    setPaymentRouteVisible(true);
  };

  const schedulePaymentRouteModalTransition = (callback: () => void) => {
    if (paymentRouteModalTransitionTimer.current) {
      clearTimeout(paymentRouteModalTransitionTimer.current);
    }

    paymentRouteModalTransitionTimer.current = setTimeout(() => {
      paymentRouteModalTransitionTimer.current = null;

      callback();
    }, ROUTE_FORM_MODAL_TRANSITION_MS);
  };

  const openOrganizationDefaultRouteForm = (
    sourceChannel: "COUNTER" | "CUSTOMER",

    route: CommercePaymentProviderRoute | null,

    viewing: boolean,
  ) => {
    // Let the defaults modal finish dismissing before mounting the route form.

    setOrganizationDefaultsVisible(false);

    setPaymentRouteFormOrigin("ORGANIZATION_DEFAULTS");

    setPaymentRouteScope({ storeId: null, sourceChannel });

    setEditingPaymentRoute(route);

    setViewingPaymentRoute(viewing);

    schedulePaymentRouteModalTransition(() => setPaymentRouteVisible(true));
  };

  const dismissPaymentRouteForm = () => {
    const returnToOrganizationDefaults =
      paymentRouteFormOrigin === "ORGANIZATION_DEFAULTS";

    setPaymentRouteVisible(false);

    schedulePaymentRouteModalTransition(() => {
      setEditingPaymentRoute(null);

      setViewingPaymentRoute(false);

      setPaymentRouteScope(null);

      setPaymentRouteFormOrigin(null);

      if (returnToOrganizationDefaults) {
        setOrganizationDefaultsVisible(true);
      }
    });
  };

  const openCatalogSource = () => {
    setSelectedCatalogIntegrationId(
      catalogSource?.source?.integrationConfigurationId ?? "",
    );

    setCatalogSourceVisible(true);
  };

  const handleCapabilityStoreChange = (storeId: string) => {
    // Clear the prior Store's configuration before the next request starts so

    // its catalog selection is never shown for the newly selected Store.

    catalogSourceRequestVersion.current += 1;

    setCatalogSource(null);

    setCatalogSourceError(null);

    setCatalogSourceLoading(Boolean(storeId));

    setSelectedCapabilityStoreId(storeId);
  };

  const saveCatalogSource = async () => {
    if (!selectedCapabilityStoreId || !catalogSource) return;

    const selected = catalogSource.candidates.find(
      (candidate) =>
        candidate.integrationConfigurationId === selectedCatalogIntegrationId,
    );

    if (!selected?.eligible) return;

    setSavingCatalogSource(true);

    try {
      const result = await catalogSourceApi.save(
        organization.id,

        selectedCapabilityStoreId,

        {
          integrationConfigurationId: selected.integrationConfigurationId,

          versionNo: catalogSource.source?.versionNo ?? 0,
        },
      );

      if (!result.success) throw new Error(result.error.message);

      setCatalogSource(result.data);

      setCatalogSourceVisible(false);
    } catch (saveError) {
      Alert.alert(
        "Unable to save Product Catalog integration",

        saveError instanceof Error
          ? saveError.message
          : "Unable to save the Store catalog source.",
      );

      await reloadCatalogSource();
    } finally {
      setSavingCatalogSource(false);
    }
  };

  const savePaymentRoute = async (route: CommercePaymentProviderRouteWrite) => {
    setSavingPaymentRoute(true);

    try {
      const result = editingPaymentRoute
        ? await paymentRouteApi.update(
            organization.id,

            editingPaymentRoute.routeId,

            route,
          )
        : await paymentRouteApi.create(organization.id, route);

      if (!result.success) throw new Error(result.error.message);

      await reloadPaymentRoutes();

      dismissPaymentRouteForm();
    } catch (saveError) {
      Alert.alert(
        "Unable to save payment route",

        saveError instanceof Error
          ? saveError.message
          : "Unable to save the payment provider route.",
      );
    } finally {
      setSavingPaymentRoute(false);
    }
  };

  const deletePaymentRoute = (route: CommercePaymentProviderRoute) => {
    Alert.alert(
      "Delete payment route",

      "This route will no longer be used for payment resolution.",

      [
        { text: "Cancel", style: "cancel" },

        {
          text: "Delete",

          style: "destructive",

          onPress: () =>
            void (async () => {
              const result = await paymentRouteApi.remove(
                organization.id,

                route.routeId,

                route.versionNo,
              );

              if (!result.success) throw new Error(result.error.message);

              await reloadPaymentRoutes();

              setOrganizationDefaultsVisible(true);
            })().catch((error: unknown) =>
              Alert.alert(
                "Unable to delete payment route",

                error instanceof Error
                  ? error.message
                  : "Unable to delete the payment provider route.",
              ),
            ),
        },
      ],
    );
  };

  const openTerminals = (
    summary: OrganizationPoyntPaymentSummary,

    integrationTypeId: string,
  ) => {
    if (summary.connectionStatus !== "VERIFIED") {
      Alert.alert(
        "Poynt verification required",

        "Poynt integration has not been verified by Platform Admin.",
      );

      return;
    }

    setTerminalSummary(summary);

    setTerminalIntegrationTypeId(integrationTypeId);
  };

  const handleSaveChanges = async () => {
    setSaving(true);

    setSaveMessage(null);

    try {
      const committedById = new Map(
        committedIntegrations.map((item) => [item.id, item]),
      );

      const workingById = new Map(integrations.map((item) => [item.id, item]));

      for (const configuration of integrations) {
        const existing = committedById.get(configuration.id);

        if (
          existing &&
          JSON.stringify(existing) === JSON.stringify(configuration)
        )
          continue;

        const saved = existing
          ? await services.organization.updateIntegrationConfiguration(
              organization.id,

              configuration,
            )
          : await services.organization.createIntegrationConfiguration(
              organization.id,

              configuration,
            );

        setCommittedIntegrations((current) => [
          ...current.filter((item) => item.id !== saved.id),

          saved,
        ]);

        setIntegrations((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
      }

      for (const configuration of committedIntegrations) {
        if (!workingById.has(configuration.id)) {
          await services.organization.deleteIntegrationConfiguration(
            organization.id,

            configuration.id,
          );

          setCommittedIntegrations((current) =>
            current.filter((item) => item.id !== configuration.id),
          );
        }
      }

      const persistedIntegrations =
        await services.organization.listIntegrationConfigurations(
          organization.id,
        );

      const visiblePersistedIntegrations = persistedIntegrations.filter(
        (item) => !item.isDeleted,
      );

      setIntegrations(visiblePersistedIntegrations);

      setCommittedIntegrations(visiblePersistedIntegrations);

      setEditingIntegration(null);

      setFormVisible(false);

      setIsViewing(false);

      setIsEditing(false);

      setSaveMessage("Changes saved successfully.");
    } catch (saveError) {
      Alert.alert(
        "Unable to save integrations",

        saveError instanceof Error
          ? saveError.message
          : "Unable to save the integration configurations.",
      );
    } finally {
      setSaving(false);
    }
  };

  const closeTerminalManager = () => {
    setTerminalSummary(null);
    setTerminalIntegrationTypeId("");
    // Refresh the selected Store's verified catalog candidates after terminal edits.
    void reloadCatalogSource();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text variant="body" color="textMuted">
          Loading integrations...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="body" color="textMuted">
          {error}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Integrations
          </Text>

          <Text variant="bodySmall" color="textMuted">
            View integrations configured by Platform Admin and manage your store
            connections.
          </Text>
        </View>
      </View>

      <View style={styles.cardSection}>
        {integrations.length === 0 ? (
          <Text variant="body" color="textMuted">
            No integrations configured.
          </Text>
        ) : (
          integrations.map((integration) => {
            const summary = poyntSummaryByIntegrationId.get(integration.id);

            const connectionStatus =
              summary?.connectionStatus ?? "NOT_CONFIGURED";

            const detailsOpen = detailsIntegrationId === integration.id;

            const canManageTerminals = summary?.connectionStatus === "VERIFIED";

            return (
              <View key={integration.id} style={styles.integrationCard}>
                <View
                  style={[
                    styles.cardHeader,

                    isMobile && styles.cardHeaderMobile,
                  ]}
                >
                  <View style={styles.cardHeaderText}>
                    <Text variant="h2" color="text">
                      {integration.integrationName} / {integration.provider}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {getTypeName(integration.integrationTypeId)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,

                      statusBadgeStyle(connectionStatus),
                    ]}
                  >
                    <Text variant="bodySmall" color="text">
                      {connectionStatusLabel(connectionStatus)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.summaryGrid,

                    isMobile && styles.summaryGridMobile,
                  ]}
                >
                  <SummaryField
                    label="Integration"
                    value={integration.integrationName}
                  />

                  <SummaryField label="Provider" value={integration.provider} />

                  <SummaryField
                    label="Capabilities"
                    value={
                      integration.provider.trim().toUpperCase() === "POYNT"
                        ? poyntCapabilities
                        : "Not available"
                    }
                  />

                  <SummaryField
                    label="Currency"
                    value={summary?.merchantCurrencyCode || "Not configured"}
                  />
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    disabled={!canManageTerminals}
                    onPress={() =>
                      summary &&
                      openTerminals(summary, integration.integrationTypeId)
                    }
                    style={({ pressed }) => [
                      styles.primaryButton,

                      !canManageTerminals && styles.buttonDisabled,

                      {
                        opacity: !canManageTerminals ? 0.5 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text variant="body" color="background">
                      Manage Store Terminals
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      setDetailsIntegrationId((current) =>
                        current === integration.id ? null : integration.id,
                      )
                    }
                    style={({ pressed }) => [
                      styles.secondaryButton,

                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text variant="body" color="text">
                      {detailsOpen
                        ? "Hide Connection Details"
                        : "View Connection Details"}
                    </Text>
                  </Pressable>
                </View>

                {detailsOpen ? (
                  <View style={styles.details}>
                    <Text variant="bodySmall" color="textMuted">
                      Connection verification confirms provider authentication
                      only. It does not verify store or catalog assignment.
                    </Text>

                    <View
                      style={[
                        styles.detailsGrid,

                        isMobile && styles.detailsGridMobile,
                      ]}
                    >
                      <DetailField
                        label="Integration Type"
                        value={getTypeName(integration.integrationTypeId)}
                      />

                      <DetailField
                        label="Integration Status"
                        value={
                          summary?.integrationStatus ??
                          getStatusName(integration.integrationStatusId)
                        }
                      />

                      <DetailField
                        label="Credential Status"
                        value={credentialStatusLabel(summary?.credentialStatus)}
                      />

                      <DetailField
                        label="Connection Status"
                        value={connectionStatusLabel(connectionStatus)}
                      />

                      <DetailField
                        label="Merchant / Business ID"
                        value={summary?.providerBusinessId || "Not configured"}
                      />

                      {summary?.providerStoreId ? (
                        <DetailField
                          label="Integration-level Poynt Store ID (legacy/default)"
                          value={summary.providerStoreId}
                        />
                      ) : null}

                      <DetailField
                        label="Currency"
                        value={
                          summary?.merchantCurrencyCode || "Not configured"
                        }
                      />

                      <DetailField
                        label="Last Verified"
                        value={formatTimestamp(summary?.lastVerifiedAt)}
                      />
                    </View>
                  </View>
                ) : null}

                {!canManageTerminals &&
                integration.provider.trim().toUpperCase() === "POYNT" ? (
                  <Text variant="bodySmall" color="textMuted">
                    Manage Store Terminals is available after Platform Admin
                    verifies Poynt authentication.
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      <View style={styles.routeHeader}>
        <View style={styles.headerText}>
          <Text variant="h2" color="text">
            Store Capability Configuration
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Choose which configured integration each Memgine Store uses.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            setPaymentRouteScope({ storeId: null });

            setEditingPaymentRoute(null);

            setViewingPaymentRoute(false);

            setOrganizationDefaultsVisible(true);
          }}
          style={styles.secondaryButton}
        >
          <Text variant="body" color="text">
            Manage organization defaults
          </Text>
        </Pressable>
      </View>

      <View style={styles.capabilityPanel}>
        <Pressable
          disabled={!selectedCapabilityStoreId || catalogSourceLoading}
          onPress={() => void reloadCatalogSource()}
          style={[
            styles.secondaryButton,

            (!selectedCapabilityStoreId || catalogSourceLoading) &&
              styles.buttonDisabled,
          ]}
        >
          <Text variant="body" color="text">
            {catalogSourceLoading
              ? "Refreshing configuration..."
              : "Refresh Configuration"}
          </Text>
        </Pressable>

        <ReferenceSelect
          label="Memgine Store"
          value={selectedCapabilityStoreId}
          items={stores}
          getItemId={(store) => store.id}
          renderItemLabel={(store) => `${store.name} (${store.storeCode})`}
          onChange={handleCapabilityStoreChange}
          placeholder="Select a Memgine Store"
        />

        {selectedCapabilityStoreId ? (
          <View style={styles.capabilityTable}>
            <CapabilityHeader isMobile={isMobile} />

            <CatalogCapabilityRow
              source={catalogSource?.source ?? null}
              loading={catalogSourceLoading}
              error={catalogSourceError}
              isMobile={isMobile}
              onChange={openCatalogSource}
            />

            <PaymentCapabilityRow
              capability="Counter Payment"
              resolution={routeResolution("COUNTER")}
              integrations={integrations}
              isMobile={isMobile}
              onEdit={() => openStoreRoute("COUNTER")}
            />

            <PaymentCapabilityRow
              capability="Customer Payment"
              resolution={routeResolution("CUSTOMER")}
              integrations={integrations}
              isMobile={isMobile}
              onEdit={() => openStoreRoute("CUSTOMER")}
            />
          </View>
        ) : (
          <Text variant="bodySmall" color="textMuted">
            Select a Memgine Store to view its capability configuration.
          </Text>
        )}

        <Text variant="bodySmall" color="textMuted">
          The active Product Catalog selection is recorded for Store
          administration. Existing synchronized products are unchanged until
          Store-scoped catalog synchronization is introduced.
        </Text>
      </View>

      <Modal
        visible={formVisible}
        onClose={handleCloseForm}
        title={
          isViewing
            ? "View Integration"
            : editingIntegration &&
                committedIntegrations.some(
                  (item) => item.id === editingIntegration.id,
                )
              ? "Edit Integration"
              : "Add Integration"
        }
        scrollable
        testID="integration-form-modal"
      >
        {editingIntegration ? (
          <IntegrationConfigurationForm
            configuration={editingIntegration}
            integrationTypes={integrationTypes}
            statuses={statuses}
            mode={
              isViewing
                ? "view"
                : committedIntegrations.some(
                      (item) => item.id === editingIntegration.id,
                    )
                  ? "edit"
                  : "add"
            }
            onSave={handleSaveDraft}
            onCancel={handleCloseForm}
          />
        ) : null}
      </Modal>

      <Modal
        visible={paymentRouteVisible}
        onClose={() => {
          if (!savingPaymentRoute) {
            dismissPaymentRouteForm();
          }
        }}
        title={
          viewingPaymentRoute
            ? "View Payment Provider Route"
            : editingPaymentRoute
              ? "Edit Payment Provider Route"
              : "Add Payment Provider Route"
        }
        scrollable
      >
        <CommercePaymentProviderRouteForm
          route={editingPaymentRoute}
          stores={stores}
          integrations={routeIntegrations}
          mode={
            viewingPaymentRoute ? "view" : editingPaymentRoute ? "edit" : "add"
          }
          allowTest={allowTestPaymentProvider}
          scope={paymentRouteScope ?? undefined}
          onSave={(route) => void savePaymentRoute(route)}
          onCancel={() => {
            dismissPaymentRouteForm();
          }}
        />
      </Modal>

      <Modal
        visible={catalogSourceVisible}
        onClose={() => {
          if (!savingCatalogSource) setCatalogSourceVisible(false);
        }}
        title="Change Product Catalog Integration"
        scrollable
      >
        <View style={styles.catalogSourceModal}>
          <Text variant="bodySmall" color="textMuted">
            Select a verified configured integration for this Store. This does
            not change existing synchronized products or terminal assignments.
          </Text>

          <ReferenceSelect
            label="Configured integration"
            required
            value={selectedCatalogIntegrationId}
            items={catalogSource?.candidates ?? []}
            getItemId={(candidate) => candidate.integrationConfigurationId}
            renderItemLabel={(candidate) =>
              `${candidate.integrationName} — ${candidate.providerCode} — ${candidate.catalogName || candidate.catalogId || "Catalog unavailable"}`
            }
            isItemDisabled={(candidate) => !candidate.eligible}
            renderItemDisabledReason={(candidate) =>
              candidate.ineligibilityReason ?? undefined
            }
            onChange={setSelectedCatalogIntegrationId}
            placeholder="Select an integration"
          />

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setCatalogSourceVisible(false)}
              style={styles.secondaryButton}
            >
              <Text variant="body" color="text">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              disabled={
                savingCatalogSource ||
                !catalogSource?.candidates.some(
                  (candidate) =>
                    candidate.integrationConfigurationId ===
                      selectedCatalogIntegrationId && candidate.eligible,
                )
              }
              onPress={() => void saveCatalogSource()}
              style={({ pressed }) => [
                styles.primaryButton,

                savingCatalogSource && styles.buttonDisabled,

                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text variant="body" color="background">
                {savingCatalogSource ? "Saving…" : "Save selection"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={organizationDefaultsVisible}
        onClose={() => setOrganizationDefaultsVisible(false)}
        title="Organization Default Payment Routes"
        scrollable
        maxWidth={900}
      >
        <View style={styles.catalogSourceModal}>
          <Text variant="bodySmall" color="textMuted">
            These routes apply when a Store has no enabled override for the
            matching payment channel.
          </Text>

          <View style={styles.organizationDefaultsList}>
            {(["COUNTER", "CUSTOMER"] as const).map((sourceChannel) => {
              const route = paymentRoutes.find(
                (item) => !item.storeId && item.sourceChannel === sourceChannel,
              );

              const label =
                sourceChannel === "COUNTER" ? "Counter" : "Customer";

              const integration = route?.integrationConfigurationId
                ? integrations.find(
                    (item) => item.id === route.integrationConfigurationId,
                  )
                : null;

              return (
                <View
                  key={sourceChannel}
                  style={styles.organizationDefaultCard}
                >
                  <View style={styles.organizationDefaultSummary}>
                    <Text variant="body" color="text">
                      {label} default
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {route
                        ? `${route.enabled ? "Enabled" : "Disabled"} · ${route.providerCode}${integration ? ` · ${integration.integrationName}` : ""}`
                        : "Not configured"}
                    </Text>
                  </View>

                  <View style={styles.organizationDefaultActions}>
                    {route ? (
                      <>
                        <Pressable
                          onPress={() => {
                            openOrganizationDefaultRouteForm(
                              sourceChannel,

                              route,

                              true,
                            );
                          }}
                          style={styles.secondaryButton}
                        >
                          <Text variant="bodySmall" color="text">
                            View
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            openOrganizationDefaultRouteForm(
                              sourceChannel,

                              route,

                              false,
                            );
                          }}
                          style={styles.secondaryButton}
                        >
                          <Text variant="bodySmall" color="text">
                            Edit
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => deletePaymentRoute(route)}
                          style={styles.secondaryButton}
                        >
                          <Text variant="bodySmall" color="text">
                            Delete
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        onPress={() => {
                          openOrganizationDefaultRouteForm(
                            sourceChannel,

                            null,

                            false,
                          );
                        }}
                        style={styles.addButton}
                      >
                        <Text variant="bodySmall" color="background">
                          Add {label} default
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!terminalSummary}
        onClose={closeTerminalManager}
        title="Poynt Store & Terminals"
        scrollable
        maxWidth={820}
      >
        {terminalSummary ? (
          <PoyntStoreTerminalManager
            organizationId={organization.id}
            summary={terminalSummary}
            stores={stores}
            integrationTypeId={terminalIntegrationTypeId}
            integrationTypes={integrationTypes}
            onClose={closeTerminalManager}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryField}>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>

      <Text variant="body" color="text">
        {value}
      </Text>
    </View>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>

      <Text variant="body" color="text" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

type PaymentRouteResolution = {
  storeRoute?: CommercePaymentProviderRoute;

  organizationDefault?: CommercePaymentProviderRoute;

  effectiveRoute?: CommercePaymentProviderRoute | null;

  configuration: string;
};

function CapabilityHeader({ isMobile }: { isMobile: boolean }) {
  if (isMobile) return null;

  return (
    <View style={[styles.capabilityRow, styles.capabilityHeaderRow]}>
      {[
        "Capability",

        "Provider",

        "Integration",

        "Configuration",

        "Status",

        "Actions",
      ].map((label) => (
        <Text
          key={label}
          variant="bodySmall"
          color="textMuted"
          style={styles.capabilityCell}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

function CatalogCapabilityRow({
  source,

  loading,

  error,

  isMobile,

  onChange,
}: {
  source: CommerceStoreCatalogSource | null;

  loading: boolean;

  error: string | null;

  isMobile: boolean;

  onChange: () => void;
}) {
  const fields = [
    ["Capability", "Product Catalog"],

    ["Provider", source?.providerCode ?? "—"],

    ["Integration", source?.integrationName ?? "Not selected"],

    [
      "Configuration",

      source?.catalogName || source?.catalogId || "Not selected",
    ],

    [
      "Status",

      loading
        ? "Loading"
        : error
          ? "Unavailable"
          : source
            ? "Configured"
            : "Not configured",
    ],
  ];

  return (
    <View
      style={[styles.capabilityRow, isMobile && styles.capabilityRowMobile]}
    >
      {fields.map(([label, value]) => (
        <View key={label} style={styles.capabilityCell}>
          {isMobile ? (
            <Text variant="caption" color="textMuted">
              {label}
            </Text>
          ) : null}

          <Text
            variant="body"
            color={label === "Status" && error ? "danger" : "text"}
          >
            {value}
          </Text>
        </View>
      ))}

      <View style={styles.capabilityCell}>
        {isMobile ? (
          <Text variant="caption" color="textMuted">
            Actions
          </Text>
        ) : null}

        <Pressable onPress={onChange} style={styles.secondaryButton}>
          <Text variant="bodySmall" color="text">
            Change Integration
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PaymentCapabilityRow({
  capability,

  resolution,

  integrations,

  isMobile,

  onEdit,
}: {
  capability: string;

  resolution: PaymentRouteResolution;

  integrations: IntegrationConfiguration[];

  isMobile: boolean;

  onEdit: () => void;
}) {
  const route = resolution.effectiveRoute;

  const integration = route?.integrationConfigurationId
    ? integrations.find((item) => item.id === route.integrationConfigurationId)
    : null;

  const fields = [
    ["Capability", capability],

    ["Provider", route?.providerCode ?? "Not configured"],

    [
      "Integration",

      integration?.integrationName ??
        (route?.providerCode === "TEST" ? "Not required" : "—"),
    ],

    ["Configuration", resolution.configuration],

    ["Status", route?.enabled ? "Enabled" : "Not configured"],
  ];

  return (
    <View
      style={[styles.capabilityRow, isMobile && styles.capabilityRowMobile]}
    >
      {fields.map(([label, value]) => (
        <View key={label} style={styles.capabilityCell}>
          {isMobile ? (
            <Text variant="caption" color="textMuted">
              {label}
            </Text>
          ) : null}

          <Text variant="body" color="text">
            {value}
          </Text>
        </View>
      ))}

      <View style={styles.capabilityCell}>
        {isMobile ? (
          <Text variant="caption" color="textMuted">
            Actions
          </Text>
        ) : null}

        <Pressable onPress={onEdit} style={styles.secondaryButton}>
          <Text variant="bodySmall" color="text">
            {resolution.storeRoute ? "Edit Route" : "Override Default"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function credentialStatusLabel(
  status?: OrganizationPoyntPaymentSummary["credentialStatus"],
) {
  if (status === "CONFIGURED") return "Configured";

  if (status === "VERIFICATION_UNAVAILABLE") return "Unable to verify";

  return "Not configured";
}

function connectionStatusLabel(
  status?:
    | OrganizationPoyntPaymentSummary["connectionStatus"]
    | "NOT_CONFIGURED",
) {
  if (status === "VERIFIED") return "Verified";

  if (status === "FAILED") return "Failed";

  if (status === "NOT_TESTED") return "Not tested";

  return "Not configured";
}

function statusBadgeStyle(
  status:
    | OrganizationPoyntPaymentSummary["connectionStatus"]
    | "NOT_CONFIGURED",
) {
  if (status === "VERIFIED") return styles.statusVerified;

  if (status === "FAILED") return styles.statusFailed;

  return styles.statusPending;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  screen: {
    padding: 24,

    gap: 24,
  },

  header: {
    gap: 6,
  },

  headerText: {
    flex: 1,

    gap: 6,
  },

  cardSection: {
    gap: 16,
  },

  integrationCard: {
    gap: 16,

    padding: 20,

    borderWidth: 1,

    borderColor: "#E5E7EB",

    borderRadius: 10,

    backgroundColor: "#FFFFFF",
  },

  cardHeader: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",

    gap: 16,
  },

  cardHeaderMobile: {
    flexDirection: "column",

    alignItems: "stretch",
  },

  cardHeaderText: {
    flex: 1,

    gap: 4,
  },

  statusBadge: {
    alignSelf: "flex-start",

    paddingHorizontal: 10,

    paddingVertical: 5,

    borderRadius: 999,
  },

  statusVerified: {
    backgroundColor: "#D1FAE5",
  },

  statusFailed: {
    backgroundColor: "#FEE2E2",
  },

  statusPending: {
    backgroundColor: "#FEF3C7",
  },

  summaryGrid: {
    flexDirection: "row",

    flexWrap: "wrap",

    columnGap: 24,

    rowGap: 16,
  },

  summaryGridMobile: {
    flexDirection: "column",

    gap: 12,
  },

  summaryField: {
    flexBasis: "45%",

    flexGrow: 1,

    gap: 4,
  },

  cardActions: {
    flexDirection: "row",

    flexWrap: "wrap",

    gap: 12,
  },

  details: {
    gap: 12,

    paddingTop: 16,

    borderTopWidth: 1,

    borderTopColor: "#E5E7EB",
  },

  detailsGrid: {
    flexDirection: "row",

    flexWrap: "wrap",

    columnGap: 24,

    rowGap: 16,
  },

  detailsGridMobile: {
    flexDirection: "column",

    gap: 12,
  },

  detailField: {
    flexBasis: "45%",

    flexGrow: 0,

    flexShrink: 1,

    gap: 4,
  },

  detailValue: {
    flexShrink: 1,
  },

  routeHeader: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 16,

    paddingTop: 8,
  },

  capabilityPanel: {
    gap: 16,

    padding: 20,

    borderWidth: 1,

    borderColor: "#E5E7EB",

    borderRadius: 10,

    backgroundColor: "#FFFFFF",
  },

  capabilityTable: {
    gap: 0,

    borderWidth: 1,

    borderColor: "#E5E7EB",

    borderRadius: 8,

    overflow: "hidden",
  },

  capabilityRow: {
    flexDirection: "row",

    flexWrap: "wrap",

    gap: 12,

    padding: 14,

    borderBottomWidth: 1,

    borderBottomColor: "#E5E7EB",
  },

  capabilityHeaderRow: {
    backgroundColor: "#F8FAFC",
  },

  capabilityRowMobile: {
    flexDirection: "column",

    gap: 10,
  },

  capabilityCell: {
    flexBasis: 110,

    flexGrow: 1,

    gap: 4,
  },

  catalogSourceModal: {
    gap: 20,
  },

  organizationDefaultsList: {
    gap: 12,
  },

  organizationDefaultCard: {
    flexDirection: "row",

    flexWrap: "wrap",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 12,

    padding: 16,

    borderWidth: 1,

    borderColor: "#E5E7EB",

    borderRadius: 8,

    backgroundColor: "#FFFFFF",
  },

  organizationDefaultSummary: {
    flexGrow: 1,

    flexShrink: 1,

    gap: 4,
  },

  organizationDefaultActions: {
    flexDirection: "row",

    flexWrap: "wrap",

    gap: 8,
  },

  modalActions: {
    flexDirection: "row",

    flexWrap: "wrap",

    justifyContent: "flex-end",

    gap: 12,
  },

  primaryButton: {
    minHeight: 44,

    paddingHorizontal: 16,

    borderRadius: 8,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#0F766E",
  },

  secondaryButton: {
    minHeight: 44,

    paddingHorizontal: 16,

    borderRadius: 8,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#E5E7EB",
  },

  addButton: {
    minHeight: 44,

    paddingHorizontal: 16,

    borderRadius: 8,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#0F766E",
  },

  buttonDisabled: {
    backgroundColor: "#94A3B8",
  },

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    padding: 24,
  },
});
