import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import type {
  Customer,
  ReferenceDataItem,
  Store,
  UserAcquisition,
} from "@/src/core";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

export type CustomerFormSubmitResult = {
  customer: Customer;
  acquisition: UserAcquisition;
};

type CustomerFormProps = {
  organizationId: string;
  stores: Store[];

  onSave: (customer: Customer, acquisition: UserAcquisition) => Promise<void>;

  onCancel: () => void;
};

type CustomerDraft = {
  fullName: string;
  email: string;
  phone: string;
  sourceStoreId: string;
};

export function CustomerForm({
  organizationId,
  stores,
  onSave,
  onCancel,
}: CustomerFormProps) {
  const [draft, setDraft] = useState<CustomerDraft>({
    fullName: "",
    email: "",
    phone: "",
    sourceStoreId: "",
  });

  const [saving, setSaving] = useState(false);

  const storeItems = useMemo(
    () =>
      stores
        .filter((store) => !store.isDeleted)
        .map((store) => ({
          id: store.id,
          name: `${store.name} (${store.storeCode})`,
        })),
    [stores],
  );

  const update = <K extends keyof CustomerDraft>(
    key: K,
    value: CustomerDraft[K],
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validate = (): string | null => {
    if (!draft.fullName.trim()) {
      return "Full Name is required.";
    }

    if (!draft.email.trim() && !draft.phone.trim()) {
      return "Please provide at least an email address or phone number.";
    }

    if (draft.email.trim()) {
      const email = draft.email.trim();

      if (!email.includes("@")) {
        return "Please enter a valid email address.";
      }
    }

    if (draft.phone.trim()) {
      const phoneDigits = draft.phone.replace(/\D/g, "");

      if (phoneDigits.length < 7) {
        return "Please enter a valid phone number.";
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();

    if (validationError) {
      Alert.alert("Invalid Prospect", validationError);
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();

      /*
       * Customer ID is intentionally generated here because the current
       * CustomerService contract creates the global Customer record.
       *
       * The parent screen performs the duplicate lookup before deciding
       * whether a new Customer needs to be created.
       */
      const customer: Customer = {
        id: "",
        fullName: draft.fullName.trim(),
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        createdAt: now,
      };

      const acquisition: UserAcquisition = {
        id: "",
        userId: "",
        organizationId,
        registrationSource: "ORG_ADMIN",
        registrationChannel: "ADMIN_UI",
        sourceStoreId: draft.sourceStoreId || undefined,
        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",
        isDeleted: false,
        versionNo: 1,
      };

      await onSave(customer, acquisition);
    } catch (error) {
      Alert.alert(
        "Unable to add prospect",
        error instanceof Error ? error.message : "Unable to add prospect.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.intro}>
        <Text variant="title" color="text">
          Add Customer
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Add a prospective customer to your organization. This will not create
          a customer relationship until the person becomes a customer through
          the purchase process.
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="bodyStrong" color="text">
          Customer Information
        </Text>

        <Input
          label="Full Name"
          value={draft.fullName}
          onChangeText={(value) => update("fullName", value)}
          placeholder="e.g. John Smith"
        />

        <Input
          label="Email"
          value={draft.email}
          onChangeText={(value) => update("email", value)}
          placeholder="e.g. john@example.com"
          keyboardType="email-address"
        />

        <Input
          label="Phone"
          value={draft.phone}
          onChangeText={(value) => update("phone", value)}
          placeholder="e.g. +91 98765 43210"
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.section}>
        <Text variant="bodyStrong" color="text">
          Acquisition
        </Text>

        <ReferenceSelect
          label="Source Store"
          value={draft.sourceStoreId}
          items={storeItems}
          allowClear
          placeholder="Select source store"
          onChange={(value) => update("sourceStoreId", value)}
        />

        <View style={styles.infoBox}>
          <Text variant="caption" color="textMuted">
            Source: Org Admin
          </Text>

          <Text variant="caption" color="textMuted">
            Channel: Admin UI
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              opacity: pressed || saving ? 0.7 : 1,
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
          style={({ pressed }) => [
            styles.primaryButton,
            {
              opacity: pressed || saving ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Add Prospect"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 24,
  },

  intro: {
    gap: 6,
  },

  section: {
    gap: 16,
  },

  infoBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    gap: 4,
    backgroundColor: "#F9FAFB",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
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
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
});
