import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Benefit, ReferenceDataItem } from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { TextArea } from "../TextArea";

type BenefitFormProps = {
  benefit: Benefit;

  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  benefitStatuses: ReferenceDataItem[];

  onSave: (benefit: Benefit) => Promise<void>;
  onCancel: () => void;
};

export function BenefitForm({
  benefit,
  benefitCategories,
  benefitTypes,
  benefitStatuses,
  onSave,
  onCancel,
}: BenefitFormProps) {
  const theme = useTheme();

  const [form, setForm] = useState<Benefit>(benefit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(benefit);
  }, [benefit]);

  const update = <K extends keyof Benefit>(field: K, value: Benefit[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
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
      {/* Benefit Information */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Benefit Information
        </Text>

        <View style={styles.grid}>
          {/* Benefit Code */}
          <View style={styles.field}>
            <Input
              label="Benefit Code"
              value={form.benefitCode}
              placeholder="e.g. PASTRY-10"
              onChangeText={(value) => update("benefitCode", value)}
            />
          </View>

          {/* Benefit Name */}
          <View style={styles.field}>
            <Input
              label="Benefit Name"
              value={form.benefitName}
              placeholder="e.g. 10% Pastry Discount"
              onChangeText={(value) => update("benefitName", value)}
            />
          </View>

          {/* Display Name */}
          <View style={styles.fullWidth}>
            <Input
              label="Display Name"
              value={form.displayName ?? ""}
              placeholder="Customer-facing benefit name"
              onChangeText={(value) =>
                update("displayName", value || undefined)
              }
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Category"
              value={form.benefitCategoryId}
              items={benefitCategories}
              placeholder="Please select"
              onChange={(value) => update("benefitCategoryId", value)}
            />
          </View>

          {/* Type */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Type"
              value={form.benefitTypeId}
              items={benefitTypes}
              placeholder="Please select"
              onChange={(value) => update("benefitTypeId", value)}
            />
          </View>

          {/* Status */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Status"
              value={form.benefitStatusId}
              items={benefitStatuses}
              placeholder="Please select"
              onChange={(value) => update("benefitStatusId", value)}
            />
          </View>
        </View>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Description
        </Text>

        <TextArea
          label="Description"
          value={form.description ?? ""}
          placeholder="Describe the benefit..."
          onChangeText={(value) => update("description", value || undefined)}
        />
      </View>

      {/* Validity */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Validity
        </Text>

        <View style={styles.grid}>
          {/* Effective Date */}
          <View style={styles.field}>
            <Input
              label="Effective Date"
              value={form.effectiveDate}
              placeholder="YYYY-MM-DD"
              onChangeText={(value) => update("effectiveDate", value)}
            />
          </View>

          {/* Expiry Date */}
          <View style={styles.field}>
            <Input
              label="Expiry Date"
              value={form.expiryDate ?? ""}
              placeholder="YYYY-MM-DD (optional)"
              onChangeText={(value) => update("expiryDate", value || undefined)}
            />
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.surfaceAlt,
              opacity: saving ? theme.states.disabledOpacity : 1,
            },
          ]}
        >
          <Text variant="body" color="text">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity: saving ? theme.states.disabledOpacity : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },

  section: {
    gap: 16,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  field: {
    width: "48%",
  },

  fullWidth: {
    width: "100%",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 8,
  },

  button: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
