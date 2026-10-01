import { useEffect, useMemo, useState } from "react";

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
  IntegrationConfiguration,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { createEmptyIntegrationConfiguration, services } from "@/src/core";
import { CommercePaymentProviderRouteApi } from "@/src/data/api/commerce-payment-provider-route-api";
import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";
import { CommercePaymentProviderRouteForm } from "@/src/ui/admin/CommercePaymentProviderRouteForm";
import { IntegrationConfigurationForm } from "@/src/ui/admin/IntegrationConfigurationForm";

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
  const [paymentRoutes, setPaymentRoutes] = useState<CommercePaymentProviderRoute[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [paymentRouteVisible, setPaymentRouteVisible] = useState(false);
  const [editingPaymentRoute, setEditingPaymentRoute] = useState<CommercePaymentProviderRoute | null>(null);
  const [viewingPaymentRoute, setViewingPaymentRoute] = useState(false);
  const [savingPaymentRoute, setSavingPaymentRoute] = useState(false);

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
  const paymentRouteApi = useMemo(() => new CommercePaymentProviderRouteApi(), []);
  const allowTestPaymentProvider = process.env.EXPO_PUBLIC_APP_ENV !== "prod";

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
        const [integrationList, typeList, statusList, routeResult, storeList] = await Promise.all([
          services.organization.listIntegrationConfigurations(organization.id),
          services.referenceData.listIntegrationTypes(),
          services.status.listIntegrationConfigurationStatuses(),
          paymentRouteApi.list(organization.id),
          services.organization.listStores(organization.id),
        ]);

        if (!routeResult.success) throw new Error(routeResult.error.message);

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
        setStores(storeList.filter((store) => !store.isDeleted));
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

  const getTypeName = (id: string) =>
    integrationTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStatusName = (id: string) =>
    statuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  const columns = useMemo<DataTableColumn<IntegrationConfiguration>[]>(
    () => [
      {
        key: "integrationName",
        title: "Name",
        width: 220,
      },
      {
        key: "integrationTypeId",
        title: "Type",
        width: 200,
        render: (item) => (
          <Text variant="body" color="text">
            {getTypeName(item.integrationTypeId)}
          </Text>
        ),
      },
      {
        key: "provider",
        title: "Provider",
        width: 180,
      },
      {
        key: "integrationStatusId",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(item.integrationStatusId)}
          </Text>
        ),
      },
    ],
    [integrationTypes, statuses],
  );

  const paymentRouteColumns = useMemo<DataTableColumn<CommercePaymentProviderRoute>[]>(
    () => [
      { key: "sourceChannel", title: "Channel", width: 130,
        render: (item) => <Text variant="body" color="text">{item.sourceChannel === "COUNTER" ? "Counter" : "Customer"}</Text> },
      { key: "storeId", title: "Scope", width: 200,
        render: (item) => <Text variant="body" color="text">{item.storeId ? stores.find((store) => store.id === item.storeId)?.name ?? "Store" : "Organization default"}</Text> },
      { key: "providerCode", title: "Provider", width: 150 },
      { key: "integrationConfigurationId", title: "Integration", width: 220,
        render: (item) => <Text variant="body" color="text">{item.integrationConfigurationId ? integrations.find((integration) => integration.id === item.integrationConfigurationId)?.integrationName ?? "Unavailable" : "—"}</Text> },
      { key: "enabled", title: "Status", width: 120,
        render: (item) => <Text variant="body" color="text">{item.enabled ? "Enabled" : "Disabled"}</Text> },
    ],
    [integrations, stores],
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

  const handleEdit = (configuration: IntegrationConfiguration) => {
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

  const savePaymentRoute = async (route: CommercePaymentProviderRouteWrite) => {
    setSavingPaymentRoute(true);
    try {
      const result = editingPaymentRoute
        ? await paymentRouteApi.update(organization.id, editingPaymentRoute.routeId, route)
        : await paymentRouteApi.create(organization.id, route);
      if (!result.success) throw new Error(result.error.message);
      await reloadPaymentRoutes();
      setPaymentRouteVisible(false);
      setEditingPaymentRoute(null);
      setViewingPaymentRoute(false);
    } catch (saveError) {
      Alert.alert("Unable to save payment route", saveError instanceof Error ? saveError.message : "Unable to save the payment provider route.");
    } finally {
      setSavingPaymentRoute(false);
    }
  };

  const deletePaymentRoute = (route: CommercePaymentProviderRoute) => {
    Alert.alert("Delete payment route", "This route will no longer be used for payment resolution.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        const result = await paymentRouteApi.remove(organization.id, route.routeId, route.versionNo);
        if (!result.success) throw new Error(result.error.message);
        await reloadPaymentRoutes();
      })().catch((error: unknown) => Alert.alert("Unable to delete payment route", error instanceof Error ? error.message : "Unable to delete the payment provider route.")) },
    ]);
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
        if (existing && JSON.stringify(existing) === JSON.stringify(configuration)) continue;
        const saved = existing
          ? await services.organization.updateIntegrationConfiguration(organization.id, configuration)
          : await services.organization.createIntegrationConfiguration(organization.id, configuration);
        setCommittedIntegrations((current) => [
          ...current.filter((item) => item.id !== saved.id), saved,
        ]);
        setIntegrations((current) => current.map((item) =>
          item.id === saved.id ? saved : item));
      }

      for (const configuration of committedIntegrations) {
        if (!workingById.has(configuration.id)) {
          await services.organization.deleteIntegrationConfiguration(
            organization.id,
            configuration.id,
          );
          setCommittedIntegrations((current) =>
            current.filter((item) => item.id !== configuration.id));
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
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Integrations
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Configure external services used by this organization.
          </Text>

          {saveMessage ? (
            <Text variant="bodySmall" color="success">
              {saveMessage}
            </Text>
          ) : null}
        </View>

        <View
          style={[styles.headerActions, isMobile && styles.headerActionsMobile]}
        >
          {!isEditing ? (
            <Pressable
              onPress={handleStartEditing}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                Edit
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleCancel}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSaveChanges()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  {saving ? "Saving..." : "Save Changes"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAdd}
                disabled={saving}
                style={({ pressed }) => [
                  styles.addButton,
                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  + Add Integration
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      <DataTable
        columns={columns}
        data={integrations}
        keyExtractor={(item) => item.id}
        emptyMessage="No integrations configured."
        actions={
          isEditing
            ? [
                {
                  label: "Edit",
                  onPress: handleEdit,
                },
                {
                  label: "Delete",
                  onPress: handleDelete,
                },
              ]
            : [
                {
                  label: "View",
                  onPress: handleView,
                },
              ]
        }
      />

      <View style={styles.routeHeader}>
        <View style={styles.headerText}>
          <Text variant="h2" color="text">Payment Provider Routes</Text>
          <Text variant="bodySmall" color="textMuted">Configure the provider used for Counter and Customer Commerce orders.</Text>
        </View>
        <Pressable onPress={() => { setEditingPaymentRoute(null); setViewingPaymentRoute(false); setPaymentRouteVisible(true); }} style={styles.addButton}>
          <Text variant="body" color="background">+ Add Payment Route</Text>
        </Pressable>
      </View>

      <DataTable
        columns={paymentRouteColumns}
        data={paymentRoutes}
        keyExtractor={(item) => item.routeId}
        emptyMessage="No payment provider routes configured."
        actions={[
          { label: "View", onPress: (route) => { setEditingPaymentRoute(route); setViewingPaymentRoute(true); setPaymentRouteVisible(true); } },
          { label: "Edit", onPress: (route) => { setEditingPaymentRoute(route); setViewingPaymentRoute(false); setPaymentRouteVisible(true); } },
          { label: "Delete", onPress: deletePaymentRoute },
        ]}
      />

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
        onClose={() => { if (!savingPaymentRoute) { setPaymentRouteVisible(false); setEditingPaymentRoute(null); setViewingPaymentRoute(false); } }}
        title={viewingPaymentRoute ? "View Payment Provider Route" : editingPaymentRoute ? "Edit Payment Provider Route" : "Add Payment Provider Route"}
        scrollable
      >
        <CommercePaymentProviderRouteForm
          route={editingPaymentRoute}
          stores={stores}
          integrations={integrations}
          mode={viewingPaymentRoute ? "view" : editingPaymentRoute ? "edit" : "add"}
          allowTest={allowTestPaymentProvider}
          onSave={(route) => void savePaymentRoute(route)}
          onCancel={() => { setPaymentRouteVisible(false); setEditingPaymentRoute(null); setViewingPaymentRoute(false); }}
        />
      </Modal>
    </ScrollView>
  );
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },

  headerText: {
    flex: 1,
    gap: 6,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  headerActionsMobile: {
    width: "100%",
    flexWrap: "wrap",
  },

  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingTop: 8,
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

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
