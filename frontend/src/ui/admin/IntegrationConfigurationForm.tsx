import { useEffect, useState } from "react";

import { Pressable, StyleSheet, View } from "react-native";

import type {
  IntegrationConfiguration,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

type Props = {
  configuration: IntegrationConfiguration | null;
  integrationTypes: ReferenceDataItem[];
  statuses: Status[];
  mode: "add" | "edit" | "view";
  onSave: (configuration: IntegrationConfiguration) => void;
  onCancel?: () => void;
};

export function IntegrationConfigurationForm({
  configuration,
  integrationTypes,
  statuses,
  mode,
  onSave,
  onCancel,
}: Props) {
  const theme = useTheme();

  const [form, setForm] = useState<IntegrationConfiguration | null>(
    configuration,
  );

  useEffect(() => {
    setForm(configuration);
  }, [configuration]);

  if (!form) {
    return null;
  }

  const readOnly = mode === "view";

  const update = <K extends keyof IntegrationConfiguration>(
    field: K,
    value: IntegrationConfiguration[K],
  ) => {
    if (readOnly) {
      return;
    }

    setForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  };

  const handleSave = () => {
    if (!form || readOnly) {
      return;
    }

    onSave({
      ...form,
      integrationName: form.integrationName.trim(),
      provider: form.provider.trim(),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <View style={styles.field}>
          <Input
            label="Integration Name"
            value={form.integrationName}
            onChangeText={(value) => update("integrationName", value)}
            placeholder="Enter integration name"
            editable={!readOnly}
          />
        </View>

        <View style={styles.field}>
          <ReferenceSelect
            label="Integration Type"
            value={form.integrationTypeId}
            items={integrationTypes}
            placeholder="Please select"
            disabled={readOnly}
            onChange={(value) => update("integrationTypeId", value)}
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Provider"
            value={form.provider}
            onChangeText={(value) => update("provider", value)}
            placeholder="Enter provider"
            editable={!readOnly}
          />
        </View>

        <View style={styles.field}>
          <ReferenceSelect
            label="Integration Status"
            value={form.integrationStatusId}
            items={statuses}
            placeholder="Please select"
            disabled={mode === "add" || readOnly}
            onChange={(value) => update("integrationStatusId", value)}
          />
        </View>
      </View>

      {!readOnly ? (
        <View style={styles.actions}>
          {onCancel ? (
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                Cancel
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="body" color="background">
              Save
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  field: {
    width: "48%",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 4,
  },

  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
});
