import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import type { MembershipProduct, Offer, Status, Store } from "@/src/core";

import { OfferCtaType } from "@/src/core";

import { FieldLabel } from "../FieldLabel";
import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

type OfferFormProps = {
  offer: Offer;
  membershipProducts: MembershipProduct[];
  stores: Store[];
  offerStatuses: Status[];
  existingOffers: Offer[];
  isNewOffer?: boolean;
  readOnly?: boolean;

  onSave: (offer: Offer) => Promise<void>;
  onCancel: () => void;
};

export function OfferForm({
  offer,
  membershipProducts,
  stores,
  offerStatuses,
  existingOffers,
  isNewOffer = false,
  readOnly = false,
  onSave,
  onCancel,
}: OfferFormProps) {
  const [draft, setDraft] = useState<Offer>(offer);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(offer);
  }, [offer]);

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

  const ctaTypeItems = useMemo(
    () => [
      { id: OfferCtaType.REDEEM_OFFER, name: "Redeem Offer" },
      { id: OfferCtaType.SHOP, name: "Shop" },
    ],
    [],
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
    if (readOnly) {
      return;
    }

    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
    setValidationError(null);
  };

  const handlePickPromotionImage = async () => {
    if (readOnly || saving) {
      return;
    }

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo Access Required",
          "Please allow photo access to select a promotion image.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      update("promotionImageUrl", result.assets[0].uri);
    } catch (error) {
      Alert.alert(
        "Unable to select image",
        error instanceof Error
          ? error.message
          : "Unable to select the promotion image.",
      );
    }
  };

  const validate = (): string | null => {
    if (!draft.offerCode.trim()) {
      return "Offer Code is required.";
    }

    const duplicateCode = existingOffers.some(
      (item) =>
        item.id !== draft.id &&
        !item.isDeleted &&
        item.offerCode.trim().toUpperCase() ===
          draft.offerCode.trim().toUpperCase(),
    );

    if (duplicateCode) {
      return "Offer Code must be unique within the Organization.";
    }

    if (!draft.offerName.trim()) {
      return "Offer Name is required.";
    }

    if (!draft.promotionImageUrl.trim()) {
      return "Promotion Image is required.";
    }

    if (!draft.ctaLabel.trim()) {
      return "CTA Label is required.";
    }

    if (!draft.ctaType) {
      return "CTA Type is required.";
    }

    if (
      draft.ctaType !== OfferCtaType.REDEEM_OFFER &&
      draft.ctaType !== OfferCtaType.SHOP
    ) {
      return "Invalid Offer CTA Type.";
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
        draft.discountPercentage <= 0 ||
        draft.discountPercentage > 100)
    ) {
      return "Discount Percentage must be greater than 0 and less than or equal to 100.";
    }

    if (!draft.statusId) {
      return "Offer Status is required.";
    }

    return null;
  };

  const handleSave = async () => {
    if (readOnly) {
      return;
    }

    const validationError = validate();

    if (validationError) {
      setValidationError(validationError);
      Alert.alert("Invalid Offer", validationError);
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      const now = new Date().toISOString();

      const normalized: Offer = {
        ...draft,
        offerCode: draft.offerCode.trim(),
        offerName: draft.offerName.trim(),
        description: draft.description?.trim() || undefined,
        promotionImageUrl: draft.promotionImageUrl.trim(),
        badgeText: draft.badgeText?.trim() || undefined,
        availabilityText: draft.availabilityText?.trim() || undefined,
        discountPercentage:
          draft.discountPercentage === undefined ||
          Number.isNaN(draft.discountPercentage)
            ? undefined
            : draft.discountPercentage,
        membershipProductId: draft.membershipProductId || undefined,
        storeId: draft.storeId || undefined,
        effectiveDate: draft.effectiveDate.trim(),
        expiryDate: draft.expiryDate?.trim() || undefined,
        ctaLabel: draft.ctaLabel.trim(),
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget?.trim() || undefined,
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
          required
          value={draft.offerCode}
          onChangeText={() => undefined}
          placeholder="e.g. ORG-SUNRISE-OFFER-001"
          editable={false}
        />

        <Input
          label="Offer Name"
          required
          value={draft.offerName}
          onChangeText={(value) => update("offerName", value)}
          placeholder="e.g. Weekend Special"
          editable={!readOnly}
        />

        <Input
          label="Description"
          value={draft.description ?? ""}
          onChangeText={(value) => update("description", value || undefined)}
          placeholder="Describe the promotional offer"
          editable={!readOnly}
        />

        <View style={styles.imageField}>
          <FieldLabel label="Promotion Image" required />

          {draft.promotionImageUrl ? (
            <Image
              source={{ uri: draft.promotionImageUrl }}
              style={styles.promotionImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text variant="bodySmall" color="textMuted">
                No promotion image selected
              </Text>
            </View>
          )}

          {!readOnly ? (
            <Pressable
              onPress={handlePickPromotionImage}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.imageButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                {draft.promotionImageUrl ? "Replace Image" : "Upload Image"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Input
          label="Badge Text"
          value={draft.badgeText ?? ""}
          onChangeText={(value) => update("badgeText", value || undefined)}
          placeholder="e.g. LIMITED TIME"
          editable={!readOnly}
        />

        <Input
          label="Availability Text"
          value={draft.availabilityText ?? ""}
          onChangeText={(value) =>
            update("availabilityText", value || undefined)
          }
          placeholder="e.g. This weekend only"
          editable={!readOnly}
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
          disabled={readOnly}
        />

        <ReferenceSelect
          label="Store"
          value={draft.storeId ?? ""}
          items={storeItems}
          allowClear
          placeholder="All stores"
          onChange={(value) => update("storeId", value || undefined)}
          disabled={readOnly}
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
          editable={!readOnly}
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Call to Action
        </Text>

        <Input
          label="CTA Label"
          required
          value={draft.ctaLabel}
          onChangeText={(value) => update("ctaLabel", value)}
          placeholder="e.g. Redeem Now"
          editable={!readOnly}
        />

        <ReferenceSelect
          label="CTA Type"
          required
          value={draft.ctaType}
          items={ctaTypeItems}
          onChange={(value) => update("ctaType", value as OfferCtaType)}
          disabled={readOnly}
        />

        <Input
          label="CTA Target"
          value={draft.ctaTarget ?? ""}
          onChangeText={(value) => update("ctaTarget", value || undefined)}
          placeholder="e.g. offer-1001"
          editable={!readOnly}
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Validity
        </Text>

        <Input
          label="Effective Date"
          required
          value={draft.effectiveDate}
          onChangeText={(value) => update("effectiveDate", value)}
          placeholder="YYYY-MM-DD"
          editable={!readOnly}
        />

        <Input
          label="Expiry Date"
          value={draft.expiryDate ?? ""}
          onChangeText={(value) => update("expiryDate", value || undefined)}
          placeholder="YYYY-MM-DD"
          editable={!readOnly}
        />
      </View>

      <View style={styles.section}>
        <ReferenceSelect
          label="Status"
          required
          value={draft.statusId}
          items={statusItems}
          onChange={(value) => update("statusId", value)}
          disabled={readOnly || isNewOffer}
        />
      </View>

      {!readOnly ? (
        <>
          {validationError ? (
            <View style={styles.validationMessage}>
              <Text variant="bodySmall" color="danger">
                {validationError}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
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
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                {saving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
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

  imageField: {
    gap: 10,
  },

  promotionImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
  },

  imagePlaceholder: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },

  imageButton: {
    alignSelf: "flex-start",
  },

  validationMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
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
