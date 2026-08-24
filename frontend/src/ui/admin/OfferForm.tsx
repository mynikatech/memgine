import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import type {
  MembershipProduct,
  Offer,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

type OfferFormProps = {
  offer: Offer;
  membershipProducts: MembershipProduct[];
  stores: Store[];
  offerStatuses: Status[];

  onSave: (offer: Offer) => Promise<void>;
  onCancel: () => void;
};

export function OfferForm({
  offer,
  membershipProducts,
  stores,
  offerStatuses,
  onSave,
  onCancel,
}: OfferFormProps) {
  const [draft, setDraft] = useState<Offer>(offer);
  const [saving, setSaving] = useState(false);

  const productItems = useMemo(
    () =>
      membershipProducts
        .filter((product) => !product.isDeleted)
        .map((product) => ({
          id: product.id,
          name: product.displayName ?? product.membershipProductName,
        })),
    [membershipProducts],
  );

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

  const statusItems = useMemo(
    () =>
      offerStatuses
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.statusName,
        })),
    [offerStatuses],
  );

  const update = <K extends keyof Offer>(key: K, value: Offer[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validate = (): string | null => {
    if (!draft.offerCode.trim()) {
      return "Offer Code is required.";
    }

    if (!draft.offerName.trim()) {
      return "Offer Name is required.";
    }

    if (!draft.effectiveDate.trim()) {
      return "Effective Date is required.";
    }

    if (draft.expiryDate && draft.expiryDate < draft.effectiveDate) {
      return "Expiry Date cannot be before the Effective Date.";
    }

    if (
      draft.discountPercentage !== undefined &&
      (!Number.isFinite(draft.discountPercentage) ||
        draft.discountPercentage < 0 ||
        draft.discountPercentage > 100)
    ) {
      return "Discount Percentage must be between 0 and 100.";
    }

    if (!draft.statusId) {
      return "Offer Status is required.";
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();

    if (validationError) {
      Alert.alert("Invalid Offer", validationError);
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();

      const normalized: Offer = {
        ...draft,

        offerCode: draft.offerCode.trim(),
        offerName: draft.offerName.trim(),
        description: draft.description?.trim() || undefined,

        discountPercentage:
          draft.discountPercentage === undefined ||
          Number.isNaN(draft.discountPercentage)
            ? undefined
            : draft.discountPercentage,

        membershipProductId: draft.membershipProductId || undefined,

        storeId: draft.storeId || undefined,

        effectiveDate: draft.effectiveDate.trim(),
        expiryDate: draft.expiryDate?.trim() || undefined,

        updatedAt: now,
        updatedBy: "user-system",
      };

      await onSave(normalized);
    } catch (error) {
      Alert.alert(
        "Unable to save offer",
        error instanceof Error ? error.message : "Unable to save offer.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.section}>
        <Text variant="body" color="text">
          Offer Information
        </Text>

        <Input
          label="Offer Code"
          value={draft.offerCode}
          onChangeText={(value) => update("offerCode", value)}
          placeholder="e.g. SUNRISE-WEEKEND-10"
        />

        <Input
          label="Offer Name"
          value={draft.offerName}
          onChangeText={(value) => update("offerName", value)}
          placeholder="e.g. Weekend Special"
        />

        <Input
          label="Description"
          value={draft.description ?? ""}
          onChangeText={(value) => update("description", value || undefined)}
          placeholder="Describe the promotional offer"
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Offer Targeting
        </Text>

        <ReferenceSelect
          label="Membership Product"
          value={draft.membershipProductId ?? ""}
          items={productItems}
          allowClear
          placeholder="All membership products"
          onChange={(value) =>
            update("membershipProductId", value || undefined)
          }
        />

        <ReferenceSelect
          label="Store"
          value={draft.storeId ?? ""}
          items={storeItems}
          allowClear
          placeholder="All stores"
          onChange={(value) => update("storeId", value || undefined)}
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Discount
        </Text>

        <Input
          label="Discount Percentage"
          value={
            draft.discountPercentage === undefined
              ? ""
              : String(draft.discountPercentage)
          }
          onChangeText={(value) => {
            const cleaned = value.replace(/[^0-9.]/g, "");

            const numericValue = cleaned === "" ? undefined : Number(cleaned);

            update("discountPercentage", numericValue);
          }}
          keyboardType="decimal-pad"
          placeholder="e.g. 10"
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Validity
        </Text>

        <Input
          label="Effective Date"
          value={draft.effectiveDate}
          onChangeText={(value) => update("effectiveDate", value)}
          placeholder="YYYY-MM-DD"
        />

        <Input
          label="Expiry Date"
          value={draft.expiryDate ?? ""}
          onChangeText={(value) => update("expiryDate", value || undefined)}
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.section}>
        <ReferenceSelect
          label="Status"
          value={draft.statusId}
          items={statusItems}
          onChange={(value) => update("statusId", value)}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={styles.secondaryButton}
        >
          <Text variant="body" color="text">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={styles.primaryButton}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save Offer"}
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

  section: {
    gap: 16,
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
