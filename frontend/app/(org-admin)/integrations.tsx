import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import {
  InMemoryReferenceDataService,
  InMemoryOrganizationService,
  IntegrationConfiguration,
  ReferenceDataItem,
  createEmptyIntegrationConfiguration,
} from "@/src/core";
import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";
import { IntegrationConfigurationForm } from "@/src/ui/admin/IntegrationConfigurationForm";

const organizationService = new InMemoryOrganizationService();
const referenceDataService = new InMemoryReferenceDataService();

export default function Integrations() {
  const { organization } = useBusiness();

  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>(
    [],
  );

  const [integrationTypes, setIntegrationTypes] = useState<ReferenceDataItem[]>(
    [],
  );

  const [statuses, setStatuses] = useState<ReferenceDataItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<IntegrationConfiguration | null>(null);

  const [formVisible, setFormVisible] = useState(false);

  const { width } = useWindowDimensions();
  const isMobile = width < 700;

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [integrationList, typeList, statusList] = await Promise.all([
          organizationService.listIntegrationConfigurations(organization.id),
          referenceDataService.listIntegrationTypes(),
          referenceDataService.listOrganizationStatuses(),
        ]);

        if (!mounted) return;

        setIntegrations(integrationList);
        setIntegrationTypes(typeList);
        setStatuses(statusList);
      } catch (loadError) {
        if (!mounted) return;

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

    load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const getTypeName = (id: string) =>
    integrationTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStatusName = (id: string) =>
    statuses.find((item) => item.id === id)?.name ?? "Unknown";

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

  const handleAdd = () => {
    const empty = createEmptyIntegrationConfiguration(
      organization.id,
      "user-system",
    );

    setEditing(empty);
    setFormVisible(true);
  };

  const handleEdit = (configuration: IntegrationConfiguration) => {
    setEditing(configuration);
    setFormVisible(true);
  };

  const handleSave = async (configuration: IntegrationConfiguration) => {
    try {
      const existing = integrations.some(
        (item) => item.id === configuration.id,
      );

      let saved: IntegrationConfiguration;

      if (existing) {
        saved = await organizationService.updateIntegrationConfiguration(
          organization.id,
          configuration,
        );

        setIntegrations((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
      } else {
        saved = await organizationService.createIntegrationConfiguration(
          organization.id,
          configuration,
        );

        setIntegrations((current) => [...current, saved]);
      }

      setFormVisible(false);
      setEditing(null);

      Alert.alert(
        "Integration saved",
        "The integration configuration has been saved.",
      );
    } catch (saveError) {
      Alert.alert(
        "Unable to save",
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the integration configuration.",
      );
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
        <View>
          <Text variant="title" color="text">
            Integrations
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Configure external services used by this organization.
          </Text>
        </View>

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addButton,
            isMobile && styles.addButtonMobile,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            + Add Integration
          </Text>
        </Pressable>
      </View>

      <DataTable
        columns={columns}
        data={integrations}
        keyExtractor={(item) => item.id}
        emptyMessage="No integrations configured."
        actions={[
          {
            label: "Edit",
            onPress: handleEdit,
          },
        ]}
      />

      <Modal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          setEditing(null);
        }}
        title={
          editing && integrations.some((item) => item.id === editing.id)
            ? "Edit Integration"
            : "Add Integration"
        }
        scrollable
        testID="integration-form-modal"
      >
        {editing ? (
          <IntegrationConfigurationForm
            configuration={editing}
            integrationTypes={integrationTypes}
            statuses={statuses}
            onSave={handleSave}
            onCancel={() => {
              setFormVisible(false);
              setEditing(null);
            }}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 24,
    gap: 24,
  },
  scroll: {
    flex: 1,
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
  addButtonMobile: {
    width: "100%",
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
