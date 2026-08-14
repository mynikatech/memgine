import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { IntegrationConfiguration, ReferenceDataItem } from "@/src/core";
import { useTheme } from "@/src/providers";

import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { Input } from "../Input";

type Props = {
  configuration: IntegrationConfiguration | null;
  integrationTypes: ReferenceDataItem[];
  statuses: ReferenceDataItem[];
  onSave: (configuration: IntegrationConfiguration) => Promise<void>;
  onCancel?: () => void;
};

export function IntegrationConfigurationForm({
  configuration,
  integrationTypes,
  statuses,
  onSave,
  onCancel,
}: Props) {
  const theme = useTheme();

  const [form, setForm] = useState<IntegrationConfiguration | null>(
    configuration,
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(configuration);
  }, [configuration]);

  if (!form) {
    return null;
  }

  const update = <K extends keyof IntegrationConfiguration>(
    field: K,
    value: IntegrationConfiguration[K],
  ) => {
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
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
          />
        </View>

        <View style={styles.field}>
          <ReferenceSelect
            label="Integration Type"
            value={form.integrationTypeId}
            items={integrationTypes}
            placeholder="Please select"
            onChange={(value) => update("integrationTypeId", value)}
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Provider"
            value={form.provider}
            onChangeText={(value) => update("provider", value)}
            placeholder="Enter provider"
          />
        </View>

        <View style={styles.field}>
          <ReferenceSelect
            label="Integration Status"
            value={form.integrationStatusId}
            items={statuses}
            placeholder="Please select"
            onChange={(value) => update("integrationStatusId", value)}
          />
        </View>
      </View>

      <View style={styles.actions}>
        {onCancel ? (
          <PressableButton
            label="Cancel"
            onPress={onCancel}
            disabled={saving}
          />
        ) : null}

        <PressableButton
          label={saving ? "Saving..." : "Save"}
          onPress={handleSave}
          disabled={saving}
          primary
        />
      </View>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
};

function PressableButton({ label, onPress, disabled, primary }: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary
          ? theme.colors.primary
          : theme.colors.surfaceAlt,
        opacity: disabled ? theme.states.disabledOpacity : 1,
      }}
    >
      <Text variant="body" color={primary ? "background" : "text"}>
        {label}
      </Text>
    </Pressable>
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
  },
});
