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
  IntegrationConfiguration,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { createEmptyIntegrationConfiguration, services } from "@/src/core";
import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";
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
        const [integrationList, typeList, statusList] = await Promise.all([
          services.organization.listIntegrationConfigurations(organization.id),
          services.referenceData.listIntegrationTypes(),
          services.status.listIntegrationConfigurationStatuses(),
        ]);

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
  }, [organization.id]);

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

        if (existing) {
          await services.organization.updateIntegrationConfiguration(
            organization.id,
            configuration,
          );
        } else {
          await services.organization.createIntegrationConfiguration(
            organization.id,
            configuration,
          );
        }
      }

      for (const configuration of committedIntegrations) {
        if (!workingById.has(configuration.id)) {
          await services.organization.deleteIntegrationConfiguration(
            organization.id,
            configuration.id,
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
