import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { DateInput } from "../DateInput";
import * as ImagePicker from "expo-image-picker";
import type { PickedBrandingAsset } from "@/src/core/brandingAssetPicker";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

import type {
  MembershipProduct,
  SubscriptionPlan,
  Offer,
  OfferUsageRule,
  Status,
  Store,
} from "@/src/core";

import { OfferCtaType, OfferFrequencyType, services } from "@/src/core";

import { FieldLabel } from "../FieldLabel";
import { Input } from "../Input";
import { Modal } from "../Modal";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { Checkbox } from "../Checkbox";
import { TextArea } from "../TextArea";
import type {
  CommerceProductMapping,
  OfferCommerceConfiguration,
  MembershipOfferApplicabilityWrite,
} from "@/src/data/api/offer-commerce-api";

type OfferFormProps = {
  offer: Offer;
  membershipProducts: MembershipProduct[];
  stores: Store[];
  offerStatuses: Status[];
  existingOffers: Offer[];
  usageRules: OfferUsageRule[];
  commerceMappings: CommerceProductMapping[];
  posProducts: Array<{ id: string; name: string }>;
  commerceConfiguration: OfferCommerceConfiguration | null;
  membershipConfiguration: MembershipOfferApplicabilityWrite | null;
  targetMode: "POS_PRODUCT" | "MEMBERSHIP_PRODUCT";
  isNewOffer?: boolean;
  readOnly?: boolean;

  onSave: (
    offer: Offer,
    usageRules: OfferUsageRule[],
    image?: PickedBrandingAsset,
    configuration?: OfferCommerceConfiguration,
    membershipConfiguration?: MembershipOfferApplicabilityWrite,
    targetMode?: "POS_PRODUCT" | "MEMBERSHIP_PRODUCT",
  ) => Promise<void>;
  onCancel: () => void;
};

const FREQUENCY_OPTIONS: Array<{
  id: OfferFrequencyType;
  name: string;
}> = [
  { id: OfferFrequencyType.DAILY, name: "Daily" },
  { id: OfferFrequencyType.WEEKLY, name: "Weekly" },
  { id: OfferFrequencyType.MONTHLY, name: "Monthly" },
  { id: OfferFrequencyType.YEARLY, name: "Yearly" },
  { id: OfferFrequencyType.ONE_TIME, name: "One Time" },
];

const COUNTRY_CURRENCY: Record<string, string> = {
  CA: "CAD",
  US: "USD",
  GB: "GBP",
  UK: "GBP",
  IN: "INR",
  AU: "AUD",
  SG: "SGD",
  AE: "AED",
  NZ: "NZD",
};
const DAY_OPTIONS = [
  { id: "MON", name: "Mon" },
  { id: "TUE", name: "Tue" },
  { id: "WED", name: "Wed" },
  { id: "THU", name: "Thu" },
  { id: "FRI", name: "Fri" },
  { id: "SAT", name: "Sat" },
  { id: "SUN", name: "Sun" },
];

const FALLBACK_TIME_ZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function getTimeZoneOptions(): Array<{ id: string; name: string }> {
  const intlWithTimeZones = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  const zones =
    typeof intlWithTimeZones.supportedValuesOf === "function"
      ? intlWithTimeZones.supportedValuesOf("timeZone")
      : FALLBACK_TIME_ZONES;

  return zones.map((zone) => ({
    id: zone,
    name: zone,
  }));
}

type TimeZoneSelectProps = {
  value: string;
  items: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function TimeZoneSelect({
  value,
  items,
  onChange,
  disabled = false,
}: TimeZoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = items.find((item) => item.id === value);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return items;
    }

    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <View style={styles.timeZoneField}>
      <FieldLabel label="Time Zone" />

      <Pressable
        disabled={disabled}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.timeZoneButton,
          {
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text variant="body" color={selected ? "text" : "textMuted"}>
          {selected?.name ?? "Select time zone"}
        </Text>

        <Text variant="bodySmall" color="textMuted">
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={() => {
          setSearch("");
          setOpen(false);
        }}
        title="Time Zone"
        scrollable
      >
        <View style={styles.timeZonePicker}>
          <Input
            label="Search time zones"
            value={search}
            placeholder="e.g. Toronto, America/Toronto"
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {filteredItems.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No time zones found.
            </Text>
          ) : (
            filteredItems.map((item) => {
              const selectedItem = item.id === value;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onChange(item.id);
                    setSearch("");
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.timeZoneOption,
                    {
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    variant="body"
                    color={selectedItem ? "primary" : "text"}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </Modal>
    </View>
  );
}

function getActiveStatusId(statuses: Status[], fallback: string): string {
  return (
    statuses.find(
      (status) =>
        status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
        status.statusName?.trim().toLowerCase() === "active",
    )?.id ?? fallback
  );
}

function createUsageRule(offer: Offer): OfferUsageRule {
  const now = new Date().toISOString();

  return {
    id: `offer-rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

    offerId: offer.id,

    ruleName: `${offer.offerName || "Offer"} Usage Rule`,

    frequencyType: OfferFrequencyType.DAILY,
    frequencyInterval: 1,
    usageLimit: 1,

    windowStartTime: undefined,
    windowEndTime: undefined,
    applicableDays: undefined,
    timeZone: undefined,

    effectiveDate: offer.effectiveDate,
    expiryDate: offer.expiryDate,

    offerUsageRuleStatusId: offer.statusId,

    createdAt: now,
    createdBy: offer.createdBy,
    updatedAt: now,
    updatedBy: offer.updatedBy,

    isDeleted: false,
    versionNo: 1,
  };
}

function cloneRules(rules: OfferUsageRule[]): OfferUsageRule[] {
  return rules.map((rule) => ({
    ...rule,
    applicableDays: rule.applicableDays ? [...rule.applicableDays] : undefined,
  }));
}
function membershipProductLabel(product: MembershipProduct): string {
  const baseName =
    product.displayName?.trim() || product.membershipProductName.trim();

  const tier = product.tier?.trim();

  if (!tier) {
    return baseName;
  }

  // Avoid "Artisan Pass Gold — Gold" if the display name already includes tier.
  if (baseName.toLowerCase().includes(tier.toLowerCase())) {
    return baseName;
  }

  return `${baseName} — ${tier}`;
}

export function OfferForm({
  offer,
  membershipProducts,
  stores,
  offerStatuses,
  existingOffers,
  usageRules,
  commerceMappings,
  posProducts,
  commerceConfiguration,
  membershipConfiguration,
  targetMode,
  isNewOffer = false,
  readOnly = false,
  onSave,
  onCancel,
}: OfferFormProps) {
  const [draft, setDraft] = useState<Offer>(offer);
  const [pendingImage, setPendingImage] = useState<
    PickedBrandingAsset | undefined
  >();
  const [rules, setRules] = useState<OfferUsageRule[]>(() =>
    cloneRules(usageRules),
  );

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [applicability, setApplicability] =
    useState<OfferCommerceConfiguration | null>(commerceConfiguration);
  const [productSearch, setProductSearch] = useState("");
  const [mode, setMode] = useState<"POS_PRODUCT" | "MEMBERSHIP_PRODUCT">(
    targetMode,
  );
  const [membershipApplicability, setMembershipApplicability] =
    useState<MembershipOfferApplicabilityWrite | null>(membershipConfiguration);
  const [defaultCurrency, setDefaultCurrency] = useState("CAD");

  const timeZoneOptions = useMemo(getTimeZoneOptions, []);

  useEffect(() => {
    let mounted = true;
    void services.organization
      .getOrganizationDetails(offer.organizationId)
      .then((details) => {
        const currency =
          COUNTRY_CURRENCY[
            details?.address.countryCode?.trim().toUpperCase() ?? ""
          ];
        if (mounted && currency) setDefaultCurrency(currency);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [offer.organizationId]);

  useEffect(() => {
    setDraft(offer);
    setPendingImage(undefined);
    setRules(cloneRules(usageRules));
    setValidationError(null);
    setApplicability(commerceConfiguration);
    setProductSearch("");
    setMode(targetMode);
    setMembershipApplicability(membershipConfiguration);
  }, [
    offer,
    usageRules,
    commerceConfiguration,
    membershipConfiguration,
    targetMode,
  ]);

  const selectedTargetProductId =
    membershipApplicability?.behavior === "PURCHASE_DISCOUNT"
      ? membershipApplicability.selectedMembershipProductIds.length === 1
        ? membershipApplicability.selectedMembershipProductIds[0]
        : undefined
      : membershipApplicability?.targetMembershipProductId;

  const targetPlans = useMemo(() => {
    if (!selectedTargetProductId) {
      return [];
    }

    return (
      membershipProducts
        .find((product) => product.id === selectedTargetProductId)
        ?.plans.filter((plan) => !plan.isDeleted) ?? []
    );
  }, [membershipProducts, selectedTargetProductId]);

  const sourcePlans = useMemo(() => {
    const sourceProductId = membershipApplicability?.sourceMembershipProductId;

    if (!sourceProductId) {
      return [];
    }

    return (
      membershipProducts
        .find((product) => product.id === sourceProductId)
        ?.plans.filter((plan) => !plan.isDeleted) ?? []
    );
  }, [membershipProducts, membershipApplicability?.sourceMembershipProductId]);
  const filteredPosProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return query
      ? posProducts.filter((product) =>
          product.name.toLowerCase().includes(query),
        )
      : posProducts;
  }, [posProducts, productSearch]);
  const productItems = useMemo(
    () =>
      membershipProducts
        .filter((product) => !product.isDeleted)
        .map((product) => ({
          id: product.id,
          name: membershipProductLabel(product),
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
      {
        id: OfferCtaType.REDEEM_OFFER,
        name: "Redeem Offer",
      },
      {
        id: OfferCtaType.SHOP,
        name: "Shop",
      },
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

  const updateRule = <K extends keyof OfferUsageRule>(
    ruleId: string,
    key: K,
    value: OfferUsageRule[K],
  ) => {
    if (readOnly) {
      return;
    }

    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              [key]: value,
            }
          : rule,
      ),
    );

    setValidationError(null);
  };

  const addRule = () => {
    if (readOnly || saving) {
      return;
    }

    const rule = createUsageRule(draft);

    rule.offerUsageRuleStatusId = getActiveStatusId(
      offerStatuses,
      draft.statusId,
    );

    setRules((current) => [...current, rule]);
    setValidationError(null);
  };

  const removeRule = (ruleId: string) => {
    if (readOnly || saving) {
      return;
    }

    setRules((current) => current.filter((rule) => rule.id !== ruleId));

    setValidationError(null);
  };

  const toggleApplicableDay = (rule: OfferUsageRule, day: string) => {
    if (readOnly) {
      return;
    }

    const currentDays = rule.applicableDays ?? [];

    const nextDays = currentDays.includes(day)
      ? currentDays.filter((item) => item !== day)
      : [...currentDays, day];

    updateRule(
      rule.id,
      "applicableDays",
      nextDays.length ? nextDays : undefined,
    );
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
        quality: 0.7,
        base64: false,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const asset = result.assets[0];

      setPendingImage({
        uri: asset.uri,
        fileName: asset.fileName ?? `offer-promotion-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      });
      update("promotionImageUrl", asset.uri);
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
      return "Offer Code must be unique.";
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

    if (mode === "POS_PRODUCT") {
      if (!applicability?.productIds.length)
        return "Select at least one POS Product.";
    } else {
      if (!membershipApplicability)
        return "Membership Product configuration is required.";
      if (
        membershipApplicability.behavior === "UPGRADE" &&
        !membershipApplicability.targetMembershipProductId
      )
        return "Upgrade To Membership Product is required.";
      if (
        membershipApplicability.behavior === "PURCHASE_DISCOUNT" &&
        membershipApplicability.membershipTargetMode ===
          "SELECTED_MEMBERSHIP_PRODUCTS" &&
        membershipApplicability.selectedMembershipProductIds.length === 0
      )
        return "Select at least one Membership Product.";
      const planProductId =
        membershipApplicability.behavior === "PURCHASE_DISCOUNT"
          ? membershipApplicability.selectedMembershipProductIds[0]
          : membershipApplicability.targetMembershipProductId;
      const targetProduct = membershipProducts.find(
        (product) => product.id === planProductId,
      );
      if (
        membershipApplicability.targetSubscriptionPlanId &&
        !targetProduct?.plans.some(
          (plan) =>
            plan.id === membershipApplicability.targetSubscriptionPlanId,
        )
      )
        return "Target Subscription Plan must belong to the target Membership Product.";
      if (
        membershipApplicability.behavior === "UPGRADE" &&
        !membershipApplicability.sourceMembershipProductId &&
        membershipApplicability.sourceSubscriptionPlanId
      )
        return "Select a Current Membership Product before selecting its plan.";
      const sourceProduct = membershipProducts.find(
        (product) =>
          product.id === membershipApplicability.sourceMembershipProductId,
      );
      if (
        membershipApplicability.behavior === "UPGRADE" &&
        membershipApplicability.sourceSubscriptionPlanId &&
        !sourceProduct?.plans.some(
          (plan) =>
            plan.id === membershipApplicability.sourceSubscriptionPlanId,
        )
      )
        return "Current Subscription Plan must belong to the current Membership Product.";
      if (
        membershipApplicability.behavior === "UPGRADE" &&
        membershipApplicability.sourceMembershipProductId ===
          membershipApplicability.targetMembershipProductId &&
        (membershipApplicability.sourceSubscriptionPlanId ?? "") ===
          (membershipApplicability.targetSubscriptionPlanId ?? "")
      )
        return "Current and target memberships cannot be identical.";
    }
    const currentAdjustment =
      mode === "POS_PRODUCT" ? applicability : membershipApplicability;
    if (
      currentAdjustment?.adjustmentType === "PRODUCT_PERCENT_OFF" &&
      (!currentAdjustment.percentage ||
        currentAdjustment.percentage <= 0 ||
        currentAdjustment.percentage > 100)
    )
      return "Percentage must be greater than 0 and at most 100.";
    const adjustmentAmountMinor = currentAdjustment?.amountMinor ?? undefined;
    if (
      ["PRODUCT_FIXED_OFF", "PRODUCT_SPECIAL_PRICE"].includes(
        currentAdjustment?.adjustmentType ?? "",
      ) &&
      (adjustmentAmountMinor === undefined ||
        adjustmentAmountMinor <
          (currentAdjustment?.adjustmentType === "PRODUCT_FIXED_OFF" ? 1 : 0))
    )
      return "Adjustment amount is required.";

    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];

      if (!rule.ruleName.trim()) {
        return `Usage Rule ${index + 1}: Rule Name is required.`;
      }

      if (!rule.frequencyType) {
        return `Usage Rule ${index + 1}: Frequency is required.`;
      }

      if (
        !Number.isInteger(rule.frequencyInterval) ||
        rule.frequencyInterval < 1
      ) {
        return `Usage Rule ${index + 1}: Frequency Interval must be at least 1.`;
      }

      if (!Number.isInteger(rule.usageLimit) || rule.usageLimit < 1) {
        return `Usage Rule ${index + 1}: Usage Limit must be at least 1.`;
      }

      if (
        rule.windowStartTime &&
        rule.windowEndTime &&
        rule.windowEndTime <= rule.windowStartTime
      ) {
        return `Usage Rule ${index + 1}: End Time must be after Start Time.`;
      }

      if (!rule.effectiveDate.trim()) {
        return `Usage Rule ${index + 1}: Effective Date is required.`;
      }

      if (rule.expiryDate && rule.expiryDate < rule.effectiveDate) {
        return `Usage Rule ${index + 1}: Expiry Date cannot be before Effective Date.`;
      }

      if (!rule.offerUsageRuleStatusId) {
        return `Usage Rule ${index + 1}: Usage Rule Status is required.`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (readOnly) {
      return;
    }

    const error = validate();

    if (error) {
      setValidationError(error);
      Alert.alert("Invalid Offer", error);
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      const now = new Date().toISOString();

      const normalizedOffer: Offer = {
        ...draft,
        offerCode: draft.offerCode.trim(),
        offerName: draft.offerName.trim(),
        description: draft.description?.trim() || undefined,
        disclaimerText: draft.disclaimerText?.trim() || undefined,
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

      const normalizedRules = rules.map((rule) => ({
        ...rule,
        offerId: normalizedOffer.id,
        ruleName: rule.ruleName.trim(),
        frequencyInterval: Number(rule.frequencyInterval),
        usageLimit: Number(rule.usageLimit),
        windowStartTime: rule.windowStartTime?.trim() || undefined,
        windowEndTime: rule.windowEndTime?.trim() || undefined,
        timeZone: rule.timeZone?.trim() || undefined,
        effectiveDate: rule.effectiveDate.trim(),
        expiryDate: rule.expiryDate?.trim() || undefined,
        updatedAt: now,
        updatedBy: "user-system",
        applicableDays:
          rule.applicableDays && rule.applicableDays.length > 0
            ? [...rule.applicableDays]
            : undefined,
      }));

      await onSave(
        normalizedOffer,
        normalizedRules,
        pendingImage,
        mode === "POS_PRODUCT" ? (applicability ?? undefined) : undefined,
        mode === "MEMBERSHIP_PRODUCT"
          ? (membershipApplicability ?? undefined)
          : undefined,
        mode,
      );
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
              source={{
                uri: resolveAssetUrl(draft.promotionImageUrl),
              }}
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

        <TextArea
          label="Disclaimer / Terms"
          value={draft.disclaimerText ?? ""}
          onChangeText={(value) => update("disclaimerText", value || undefined)}
          placeholder="Optional customer-facing terms or restrictions"
          maxLength={500}
          editable={!readOnly}
        />
      </View>
      <View style={styles.section}>
        <Text variant="body" color="text">
          Offer Targeting
        </Text>

        <ReferenceSelect
          label="Membership Scope"
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
          Offer Applies To
        </Text>
        <View style={styles.modeRow}>
          <Pressable
            disabled={readOnly}
            onPress={() => setMode("POS_PRODUCT")}
            style={[
              styles.modeButton,
              mode === "POS_PRODUCT" && styles.modeButtonSelected,
            ]}
          >
            <Text
              variant="body"
              color={mode === "POS_PRODUCT" ? "background" : "text"}
            >
              POS Product
            </Text>
          </Pressable>
          <Pressable
            disabled={readOnly}
            onPress={() => setMode("MEMBERSHIP_PRODUCT")}
            style={[
              styles.modeButton,
              mode === "MEMBERSHIP_PRODUCT" && styles.modeButtonSelected,
            ]}
          >
            <Text
              variant="body"
              color={mode === "MEMBERSHIP_PRODUCT" ? "background" : "text"}
            >
              Membership Product
            </Text>
          </Pressable>
        </View>
        {mode === "POS_PRODUCT" ? (
          <>
            <Text variant="body" color="text">
              POS Product Adjustment
            </Text>
            <ReferenceSelect
              label="Adjustment Type"
              required
              value={applicability?.adjustmentType ?? "PRODUCT_PERCENT_OFF"}
              items={[
                { id: "PRODUCT_PERCENT_OFF", name: "Percent off" },
                { id: "PRODUCT_FIXED_OFF", name: "Fixed amount off" },
                { id: "PRODUCT_SPECIAL_PRICE", name: "Special price" },
                { id: "PRODUCT_FREE", name: "Free product" },
              ]}
              onChange={(adjustmentType) =>
                setApplicability((current) => ({
                  adjustmentType:
                    adjustmentType as OfferCommerceConfiguration["adjustmentType"],
                  active: true,
                  productIds: current?.productIds ?? [],
                  percentage:
                    adjustmentType === "PRODUCT_PERCENT_OFF"
                      ? current?.percentage
                      : undefined,
                  amountMinor: [
                    "PRODUCT_FIXED_OFF",
                    "PRODUCT_SPECIAL_PRICE",
                  ].includes(adjustmentType)
                    ? current?.amountMinor
                    : undefined,
                  currencyCode: [
                    "PRODUCT_FIXED_OFF",
                    "PRODUCT_SPECIAL_PRICE",
                  ].includes(adjustmentType)
                    ? (current?.currencyCode ?? defaultCurrency)
                    : undefined,
                }))
              }
              disabled={readOnly}
            />
            {applicability?.adjustmentType === "PRODUCT_PERCENT_OFF" ? (
              <Input
                label="Percentage"
                value={applicability.percentage?.toString() ?? ""}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setApplicability((current) =>
                    current
                      ? {
                          ...current,
                          percentage:
                            Number(value.replace(/[^0-9.]/g, "")) || undefined,
                        }
                      : current,
                  )
                }
                editable={!readOnly}
              />
            ) : null}
            {["PRODUCT_FIXED_OFF", "PRODUCT_SPECIAL_PRICE"].includes(
              applicability?.adjustmentType ?? "",
            ) ? (
              <Input
                label={
                  applicability?.adjustmentType === "PRODUCT_SPECIAL_PRICE"
                    ? `Special Price (${applicability?.currencyCode ?? defaultCurrency})`
                    : `Amount Off (${applicability?.currencyCode ?? defaultCurrency})`
                }
                value={
                  applicability?.amountMinor === undefined
                    ? ""
                    : (applicability.amountMinor / 100).toFixed(2)
                }
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setApplicability((current) =>
                    current
                      ? {
                          ...current,
                          amountMinor: value
                            ? Math.round(
                                Number(value.replace(/[^0-9.]/g, "")) * 100,
                              )
                            : undefined,
                          currencyCode: current.currencyCode ?? defaultCurrency,
                        }
                      : current,
                  )
                }
                editable={!readOnly}
              />
            ) : null}
            <FieldLabel label="POS Products" required />
            <Input
              label="Search products"
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Search name or code"
              editable={!readOnly}
            />
            <ScrollView style={styles.productList} nestedScrollEnabled>
              {filteredPosProducts.map((product) => (
                <Checkbox
                  key={product.id}
                  value={
                    applicability?.productIds.includes(product.id) ?? false
                  }
                  onValueChange={() =>
                    setApplicability((current) => {
                      const productIds = current?.productIds ?? [];
                      return {
                        adjustmentType:
                          current?.adjustmentType ?? "PRODUCT_PERCENT_OFF",
                        active: current?.active ?? true,
                        percentage: current?.percentage,
                        amountMinor: current?.amountMinor,
                        currencyCode: current?.currencyCode,
                        productIds: productIds.includes(product.id)
                          ? productIds.filter((id) => id !== product.id)
                          : [...productIds, product.id],
                      };
                    })
                  }
                  label={product.name}
                  disabled={readOnly}
                />
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <Text variant="body" color="text">
              Membership Offer Type
            </Text>
            <View style={styles.modeRow}>
              <Pressable
                disabled={readOnly}
                onPress={() =>
                  setMembershipApplicability((current) => ({
                    ...(current ?? {
                      targetMembershipProductId: "",
                      adjustmentType: "PRODUCT_PERCENT_OFF",
                      active: true,
                      customerApplicability: "ALL",
                      membershipTargetMode: "ALL_MEMBERSHIP_PRODUCTS",
                      selectedMembershipProductIds: [],
                    }),
                    behavior: "PURCHASE_DISCOUNT",
                    sourceMembershipProductId: undefined,
                    sourceSubscriptionPlanId: undefined,
                  }))
                }
                style={[
                  styles.modeButton,
                  membershipApplicability?.behavior === "PURCHASE_DISCOUNT" &&
                    styles.modeButtonSelected,
                ]}
              >
                <Text
                  variant="body"
                  color={
                    membershipApplicability?.behavior === "PURCHASE_DISCOUNT"
                      ? "background"
                      : "text"
                  }
                >
                  Purchase Discount
                </Text>
              </Pressable>
              <Pressable
                disabled={readOnly}
                onPress={() =>
                  setMembershipApplicability((current) => ({
                    ...(current ?? {
                      targetMembershipProductId: "",
                      adjustmentType: "PRODUCT_PERCENT_OFF",
                      active: true,
                      customerApplicability: "ALL",
                      membershipTargetMode: "ALL_MEMBERSHIP_PRODUCTS",
                      selectedMembershipProductIds: [],
                    }),
                    behavior: "UPGRADE",
                  }))
                }
                style={[
                  styles.modeButton,
                  membershipApplicability?.behavior === "UPGRADE" &&
                    styles.modeButtonSelected,
                ]}
              >
                <Text
                  variant="body"
                  color={
                    membershipApplicability?.behavior === "UPGRADE"
                      ? "background"
                      : "text"
                  }
                >
                  Upgrade
                </Text>
              </Pressable>
            </View>
            {membershipApplicability?.behavior === "PURCHASE_DISCOUNT" ? (
              <>
                <Text variant="body" color="text">
                  Customer Eligibility
                </Text>
                <View style={styles.modeRow}>
                  {(
                    [
                      ["ALL", "Everyone"],
                      ["NEW_CUSTOMER", "New Customers"],
                      ["EXISTING_CUSTOMER", "Existing Customers"],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      disabled={readOnly}
                      onPress={() =>
                        setMembershipApplicability((current) =>
                          current
                            ? { ...current, customerApplicability: value }
                            : current,
                        )
                      }
                      style={[
                        styles.modeButton,
                        membershipApplicability.customerApplicability ===
                          value && styles.modeButtonSelected,
                      ]}
                    >
                      <Text
                        variant="bodySmall"
                        color={
                          membershipApplicability.customerApplicability ===
                          value
                            ? "background"
                            : "text"
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text variant="body" color="text">
                  Membership Applies To
                </Text>
                <View style={styles.modeRow}>
                  {(
                    [
                      ["ALL_MEMBERSHIP_PRODUCTS", "All Membership Products"],
                      [
                        "SELECTED_MEMBERSHIP_PRODUCTS",
                        "Selected Membership Products",
                      ],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      disabled={readOnly}
                      onPress={() =>
                        setMembershipApplicability((current) =>
                          current
                            ? {
                                ...current,
                                membershipTargetMode: value,
                                selectedMembershipProductIds:
                                  value === "ALL_MEMBERSHIP_PRODUCTS"
                                    ? []
                                    : current.selectedMembershipProductIds,
                                targetSubscriptionPlanId:
                                  value === "ALL_MEMBERSHIP_PRODUCTS"
                                    ? undefined
                                    : current.targetSubscriptionPlanId,
                              }
                            : current,
                        )
                      }
                      style={[
                        styles.modeButton,
                        membershipApplicability.membershipTargetMode ===
                          value && styles.modeButtonSelected,
                      ]}
                    >
                      <Text
                        variant="bodySmall"
                        color={
                          membershipApplicability.membershipTargetMode === value
                            ? "background"
                            : "text"
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {membershipApplicability.membershipTargetMode ===
                "SELECTED_MEMBERSHIP_PRODUCTS" ? (
                  <ScrollView style={styles.productList} nestedScrollEnabled>
                    {productItems.map((product) => (
                      <Checkbox
                        key={product.id}
                        value={membershipApplicability.selectedMembershipProductIds.includes(
                          product.id,
                        )}
                        onValueChange={() =>
                          setMembershipApplicability((current) =>
                            current
                              ? {
                                  ...current,
                                  selectedMembershipProductIds:
                                    current.selectedMembershipProductIds.includes(
                                      product.id,
                                    )
                                      ? current.selectedMembershipProductIds.filter(
                                          (id) => id !== product.id,
                                        )
                                      : [
                                          ...current.selectedMembershipProductIds,
                                          product.id,
                                        ],
                                  targetSubscriptionPlanId: undefined,
                                }
                              : current,
                          )
                        }
                        label={product.name}
                        disabled={readOnly}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {membershipApplicability.membershipTargetMode ===
                  "SELECTED_MEMBERSHIP_PRODUCTS" &&
                membershipApplicability.selectedMembershipProductIds.length ===
                  1 ? (
                  <ReferenceSelect
                    label="Target Subscription Plan"
                    value={
                      membershipApplicability.targetSubscriptionPlanId ?? ""
                    }
                    items={targetPlans
                      .filter((plan) => !plan.isDeleted)
                      .map((plan) => ({
                        id: plan.id,
                        name: plan.subscriptionPlanName,
                      }))}
                    allowClear
                    onChange={(value) =>
                      setMembershipApplicability((current) =>
                        current
                          ? {
                              ...current,
                              targetSubscriptionPlanId: value || undefined,
                            }
                          : current,
                      )
                    }
                    disabled={readOnly}
                  />
                ) : null}
              </>
            ) : (
              <>
                <ReferenceSelect
                  label="Current Membership Product"
                  value={
                    membershipApplicability?.sourceMembershipProductId ?? ""
                  }
                  items={productItems}
                  allowClear
                  onChange={(value) =>
                    setMembershipApplicability((current) =>
                      current
                        ? {
                            ...current,
                            sourceMembershipProductId: value || undefined,
                            sourceSubscriptionPlanId: undefined,
                          }
                        : current,
                    )
                  }
                  disabled={readOnly}
                />
                <ReferenceSelect
                  label="Current Subscription Plan"
                  value={
                    membershipApplicability?.sourceSubscriptionPlanId ?? ""
                  }
                  items={sourcePlans
                    .filter((plan) => !plan.isDeleted)
                    .map((plan) => ({
                      id: plan.id,
                      name: plan.subscriptionPlanName,
                    }))}
                  allowClear
                  onChange={(value) =>
                    setMembershipApplicability((current) =>
                      current
                        ? {
                            ...current,
                            sourceSubscriptionPlanId: value || undefined,
                          }
                        : current,
                    )
                  }
                  disabled={
                    readOnly ||
                    !membershipApplicability?.sourceMembershipProductId
                  }
                />
                <ReferenceSelect
                  label="Upgrade To Membership Product"
                  required
                  value={
                    membershipApplicability?.targetMembershipProductId ?? ""
                  }
                  items={productItems}
                  onChange={(value) =>
                    setMembershipApplicability((current) => ({
                      ...(current ?? {
                        behavior: "UPGRADE",
                        adjustmentType: "PRODUCT_PERCENT_OFF",
                        active: true,
                        customerApplicability: "ALL",
                        membershipTargetMode: "ALL_MEMBERSHIP_PRODUCTS",
                        selectedMembershipProductIds: [],
                      }),
                      targetMembershipProductId: value,
                      targetSubscriptionPlanId: undefined,
                    }))
                  }
                  disabled={readOnly}
                />
                <ReferenceSelect
                  label="Upgrade To Subscription Plan"
                  value={
                    membershipApplicability?.targetSubscriptionPlanId ?? ""
                  }
                  items={targetPlans
                    .filter((plan) => !plan.isDeleted)
                    .map((plan) => ({
                      id: plan.id,
                      name: plan.subscriptionPlanName,
                    }))}
                  allowClear
                  onChange={(value) =>
                    setMembershipApplicability((current) =>
                      current
                        ? {
                            ...current,
                            targetSubscriptionPlanId: value || undefined,
                          }
                        : current,
                    )
                  }
                  disabled={
                    readOnly ||
                    !membershipApplicability?.targetMembershipProductId
                  }
                />
              </>
            )}
            <ReferenceSelect
              label="Offer Adjustment"
              required
              value={
                membershipApplicability?.adjustmentType ?? "PRODUCT_PERCENT_OFF"
              }
              items={[
                { id: "PRODUCT_PERCENT_OFF", name: "Percentage Off" },
                { id: "PRODUCT_FIXED_OFF", name: "Fixed Amount Off" },
                { id: "PRODUCT_SPECIAL_PRICE", name: "Special Price" },
              ]}
              onChange={(value) =>
                setMembershipApplicability((current) =>
                  current
                    ? {
                        ...current,
                        adjustmentType:
                          value as MembershipOfferApplicabilityWrite["adjustmentType"],
                        percentage:
                          value === "PRODUCT_PERCENT_OFF"
                            ? current.percentage
                            : undefined,
                        amountMinor:
                          value === "PRODUCT_PERCENT_OFF"
                            ? undefined
                            : current.amountMinor,
                        currencyCode:
                          value === "PRODUCT_PERCENT_OFF"
                            ? undefined
                            : (current.currencyCode ?? defaultCurrency),
                      }
                    : current,
                )
              }
              disabled={readOnly}
            />
            {membershipApplicability?.adjustmentType ===
            "PRODUCT_PERCENT_OFF" ? (
              <Input
                label="Percentage"
                value={membershipApplicability.percentage?.toString() ?? ""}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setMembershipApplicability((current) =>
                    current
                      ? {
                          ...current,
                          percentage:
                            Number(value.replace(/[^0-9.]/g, "")) || undefined,
                        }
                      : current,
                  )
                }
                editable={!readOnly}
              />
            ) : null}
            {["PRODUCT_FIXED_OFF", "PRODUCT_SPECIAL_PRICE"].includes(
              membershipApplicability?.adjustmentType ?? "",
            ) ? (
              <Input
                label={
                  membershipApplicability?.adjustmentType ===
                  "PRODUCT_SPECIAL_PRICE"
                    ? `Special Membership Price (${membershipApplicability?.currencyCode ?? defaultCurrency})`
                    : `Fixed Discount Amount (${membershipApplicability?.currencyCode ?? defaultCurrency})`
                }
                value={
                  membershipApplicability?.amountMinor == null
                    ? ""
                    : (
                        (membershipApplicability?.amountMinor ?? 0) / 100
                      ).toFixed(2)
                }
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setMembershipApplicability((current) =>
                    current
                      ? {
                          ...current,
                          amountMinor: value
                            ? Math.round(
                                Number(value.replace(/[^0-9.]/g, "")) * 100,
                              )
                            : undefined,
                          currencyCode: current.currencyCode ?? defaultCurrency,
                        }
                      : current,
                  )
                }
                editable={!readOnly}
              />
            ) : null}
          </>
        )}
      </View>{" "}
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

        <DateInput
          label="Effective Date"
          required
          value={draft.effectiveDate}
          disabled={readOnly}
          onChange={(value) => update("effectiveDate", value ?? "")}
        />

        <DateInput
          label="Expiry Date"
          value={draft.expiryDate}
          disabled={readOnly}
          minimumDate={draft.effectiveDate}
          onChange={(value) => update("expiryDate", value)}
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
      {/* ---------------------------------------------------------- */}
      {/* Offer Usage Rules                                           */}
      {/* ---------------------------------------------------------- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text variant="body" color="text">
              Offer Usage Rules
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Define how often and when this offer can be redeemed.
            </Text>
          </View>

          {!readOnly ? (
            <Pressable
              onPress={addRule}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                + Add Rule
              </Text>
            </Pressable>
          ) : null}
        </View>

        {rules.length === 0 ? (
          <View style={styles.emptyRules}>
            <Text variant="bodySmall" color="textMuted">
              No usage rules configured.
            </Text>
          </View>
        ) : (
          rules.map((rule, index) => (
            <View key={rule.id} style={styles.ruleCard}>
              <View style={styles.ruleHeader}>
                <Text variant="body" color="text">
                  Usage Rule {index + 1}
                </Text>

                {!readOnly ? (
                  <Pressable
                    onPress={() => removeRule(rule.id)}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.removeButton,
                      {
                        opacity: saving ? 0.5 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text variant="bodySmall" color="danger">
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Input
                label="Rule Name"
                required
                value={rule.ruleName}
                onChangeText={(value) => updateRule(rule.id, "ruleName", value)}
                placeholder="e.g. Once Per Day"
                editable={!readOnly}
              />

              <ReferenceSelect
                label="Frequency"
                required
                value={rule.frequencyType}
                items={FREQUENCY_OPTIONS}
                onChange={(value) =>
                  updateRule(
                    rule.id,
                    "frequencyType",
                    value as OfferFrequencyType,
                  )
                }
                disabled={readOnly}
              />

              <Input
                label="Frequency Interval"
                required
                value={String(rule.frequencyInterval)}
                onChangeText={(value) => {
                  const numeric = value.replace(/[^0-9]/g, "");

                  updateRule(
                    rule.id,
                    "frequencyInterval",
                    numeric ? Number(numeric) : 0,
                  );
                }}
                keyboardType="number-pad"
                placeholder="e.g. 1"
                editable={!readOnly}
              />

              <Input
                label="Usage Limit"
                required
                value={String(rule.usageLimit)}
                onChangeText={(value) => {
                  const numeric = value.replace(/[^0-9]/g, "");

                  updateRule(
                    rule.id,
                    "usageLimit",
                    numeric ? Number(numeric) : 0,
                  );
                }}
                keyboardType="number-pad"
                placeholder="e.g. 1"
                editable={!readOnly}
              />

              <View style={styles.daysField}>
                <FieldLabel label="Applicable Days" />

                <View style={styles.dayRow}>
                  {DAY_OPTIONS.map((day) => {
                    const selected = (rule.applicableDays ?? []).includes(
                      day.id,
                    );

                    return (
                      <Pressable
                        key={day.id}
                        disabled={readOnly}
                        onPress={() => toggleApplicableDay(rule, day.id)}
                        style={[
                          styles.dayButton,
                          selected && styles.dayButtonSelected,
                          {
                            opacity: readOnly ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Text
                          variant="bodySmall"
                          color={selected ? "background" : "text"}
                        >
                          {day.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text variant="bodySmall" color="textMuted">
                  Leave all days unselected for the rule to apply without a
                  day-of-week restriction.
                </Text>
              </View>

              <View style={styles.twoColumn}>
                <View style={styles.column}>
                  <Input
                    label="Start Time"
                    value={rule.windowStartTime ?? ""}
                    onChangeText={(value) =>
                      updateRule(rule.id, "windowStartTime", value || undefined)
                    }
                    placeholder="HH:MM"
                    editable={!readOnly}
                  />
                </View>

                <View style={styles.column}>
                  <Input
                    label="End Time"
                    value={rule.windowEndTime ?? ""}
                    onChangeText={(value) =>
                      updateRule(rule.id, "windowEndTime", value || undefined)
                    }
                    placeholder="HH:MM"
                    editable={!readOnly}
                  />
                </View>
              </View>

              <TimeZoneSelect
                value={rule.timeZone ?? ""}
                items={timeZoneOptions}
                onChange={(value) =>
                  updateRule(rule.id, "timeZone", value || undefined)
                }
                disabled={readOnly}
              />

              <DateInput
                label="Effective Date"
                required
                value={rule.effectiveDate}
                disabled={readOnly}
                onChange={(value) =>
                  updateRule(rule.id, "effectiveDate", value ?? "")
                }
              />

              <DateInput
                label="Expiry Date"
                value={rule.expiryDate}
                disabled={readOnly}
                minimumDate={rule.effectiveDate}
                onChange={(value) => updateRule(rule.id, "expiryDate", value)}
              />

              <ReferenceSelect
                label="Usage Rule Status"
                required
                value={rule.offerUsageRuleStatusId}
                items={statusItems}
                onChange={(value) =>
                  updateRule(rule.id, "offerUsageRuleStatusId", value)
                }
                disabled={readOnly}
              />
            </View>
          ))
        )}
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

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  sectionHeaderText: {
    flex: 1,
    gap: 4,
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

  ruleCard: {
    gap: 16,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  removeButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: "center",
  },

  emptyRules: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  daysField: {
    gap: 10,
  },

  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  dayButton: {
    minWidth: 48,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },

  dayButtonSelected: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },

  twoColumn: {
    flexDirection: "row",
    gap: 12,
  },

  column: {
    flex: 1,
  },

  timeZoneField: {
    gap: 8,
  },

  timeZoneButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  timeZonePicker: {
    gap: 12,
  },

  productList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
  },
  modeRow: { flexDirection: "row", gap: 10 },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonSelected: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  timeZoneOption: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: "center",
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
