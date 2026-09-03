import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  ReferenceDataItem,
  Status,
  SubscriptionPlan,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { TextArea } from "../TextArea";

type MembershipFormProps = {
  product: MembershipProduct;
  isNewProduct?: boolean;
  benefits: Benefit[];
  productCategories: ReferenceDataItem[];
  productTypes: ReferenceDataItem[];
  productStatuses: Status[];
  subscriptionPlanStatuses: Status[];
  currencies: ReferenceDataItem[];
  onSave: (product: MembershipProduct) => Promise<void>;
  onCancel: () => void;
};

type PlanDraft = SubscriptionPlan;

function isActiveStatus(status: Status | undefined): boolean {
  return (
    status?.statusCode?.trim().toUpperCase() === "ACTIVE" ||
    status?.statusName?.trim().toLowerCase() === "active"
  );
}

export function MembershipForm({
  product,
  isNewProduct = false,
  benefits,
  productCategories,
  productTypes,
  productStatuses,
  subscriptionPlanStatuses,
  currencies,
  onSave,
  onCancel,
}: MembershipFormProps) {
  const theme = useTheme();

  const [draft, setDraft] = useState<MembershipProduct>(product);
  const [saving, setSaving] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(product);
    setPriceInputs(
      Object.fromEntries(
        product.plans.map((plan) => [
          plan.id,
          (plan.price.amountMinor / 100).toFixed(2),
        ]),
      ),
    );
  }, [product]);

  const existingPlanIds = useMemo(
    () => new Set(product.plans.map((plan) => plan.id)),
    [product.plans],
  );

  const update = <K extends keyof MembershipProduct>(
    field: K,
    value: MembershipProduct[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const activeBenefits = useMemo(
    () => benefits.filter((item) => !item.isDeleted),
    [benefits],
  );

  const toggleBenefit = (benefitId: string) => {
    setDraft((current) => ({
      ...current,
      benefitIds: current.benefitIds.includes(benefitId)
        ? current.benefitIds.filter((id) => id !== benefitId)
        : [...current.benefitIds, benefitId],
    }));
  };

  const createPlan = (): PlanDraft => {
    const now = new Date().toISOString();
    const activePlanStatus = subscriptionPlanStatuses.find(isActiveStatus);
    const defaultCurrency =
      currencies.find((item) => item.code?.toUpperCase() === "INR") ??
      currencies[0];

    return {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      membershipProductId: draft.id,
      subscriptionPlanCode: "",
      subscriptionPlanName: "",
      description: "",
      subscriptionPeriod: 1,
      subscriptionPeriodUnit: "MONTH",
      price: {
        amountMinor: 0,
        currency: defaultCurrency?.code ?? "INR",
      },
      currencyId: defaultCurrency?.id ?? "",
      subscriptionPlanStatusId: activePlanStatus?.id ?? "",
      effectiveDate: draft.effectiveDate,
      expiryDate: undefined,
      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",
      isDeleted: false,
      versionNo: 1,
    };
  };

  const addPlan = () => {
    setDraft((current) => ({
      ...current,
      plans: [...current.plans, createPlan()],
    }));
  };

  const updatePlan = <K extends keyof SubscriptionPlan>(
    planId: string,
    field: K,
    value: SubscriptionPlan[K],
  ) => {
    setDraft((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === planId ? { ...plan, [field]: value } : plan,
      ),
    }));
  };

  const removePlan = (planId: string) => {
    if (draft.plans.length <= 1) {
      Alert.alert(
        "Subscription Plan Required",
        "A membership must have at least one subscription plan.",
      );
      return;
    }

    setDraft((current) => ({
      ...current,
      plans: current.plans.filter((plan) => plan.id !== planId),
    }));
  };

  const validate = (): string | null => {
    if (!draft.membershipProductCode.trim()) {
      return "Membership Product Code is required.";
    }

    if (!draft.membershipProductName.trim()) {
      return "Membership Product Name is required.";
    }

    if (!draft.productCategoryId) {
      return "Product Category is required.";
    }

    if (!draft.productTypeId) {
      return "Product Type is required.";
    }

    if (!draft.productStatusId) {
      return "Product Status is required.";
    }

    if (!draft.effectiveDate) {
      return "Effective Date is required.";
    }

    if (draft.expiryDate && draft.expiryDate < draft.effectiveDate) {
      return "Expiry Date cannot be before Effective Date.";
    }

    if (draft.benefitIds.length === 0) {
      return "At least one active benefit is required.";
    }

    const activePlans = draft.plans.filter((plan) => !plan.isDeleted);

    if (activePlans.length === 0) {
      return "At least one subscription plan is required.";
    }

    for (const plan of activePlans) {
      if (!plan.subscriptionPlanCode.trim()) {
        return "Every subscription plan must have a Plan Code.";
      }

      if (!plan.subscriptionPlanName.trim()) {
        return "Every subscription plan must have a Plan Name.";
      }

      if (
        !Number.isInteger(plan.subscriptionPeriod) ||
        plan.subscriptionPeriod <= 0
      ) {
        return "Subscription Period must be a whole number greater than zero.";
      }

      if (!plan.subscriptionPeriodUnit.trim()) {
        return "Subscription Period Unit is required.";
      }

      if (!plan.currencyId) {
        return "Currency is required for every subscription plan.";
      }

      if (!plan.subscriptionPlanStatusId) {
        return "Plan Status is required for every subscription plan.";
      }

      if (!plan.effectiveDate) {
        return "Effective Date is required for every subscription plan.";
      }

      if (plan.expiryDate && plan.expiryDate < plan.effectiveDate) {
        return "A plan's Expiry Date cannot be before its Effective Date.";
      }

      const priceText = priceInputs[plan.id] ?? "0";
      const amount = Number(priceText);

      if (!Number.isFinite(amount) || amount < 0) {
        return "Price must be zero or greater for every subscription plan.";
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();

    if (validationError) {
      Alert.alert("Invalid Membership", validationError);
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();

      const normalized: MembershipProduct = {
        ...draft,
        membershipProductCode: draft.membershipProductCode.trim(),
        membershipProductName: draft.membershipProductName.trim(),
        displayName: draft.displayName?.trim() || undefined,
        description: draft.description?.trim() || undefined,
        updatedAt: now,
        updatedBy: "user-system",
        benefitIds: Array.from(new Set(draft.benefitIds)),
        plans: draft.plans.map((plan) => {
          const priceText = priceInputs[plan.id] ?? "0";
          const amountMinor = Math.round(Number(priceText) * 100);

          return {
            ...plan,
            membershipProductId: draft.id,
            subscriptionPlanCode: plan.subscriptionPlanCode.trim(),
            subscriptionPlanName: plan.subscriptionPlanName.trim(),
            description: plan.description?.trim() || undefined,
            price: {
              ...plan.price,
              amountMinor,
            },
            updatedAt: now,
            updatedBy: "user-system",
          };
        }),
      };

      await onSave(normalized);
    } catch (error) {
      Alert.alert(
        "Unable to save membership draft",
        error instanceof Error
          ? error.message
          : "Unable to save membership draft.",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedBenefit = (benefitId: string) =>
    draft.benefitIds.includes(benefitId);

  return (
    <View style={styles.container}>
      <Text variant="title" color="text">
        Membership Product
      </Text>

      <Text variant="bodySmall" color="textMuted">
        Configure the membership product, benefits and subscription plans
        offered by this business.
      </Text>

      <View style={styles.section}>
        <Text variant="body" color="text">
          Product Information
        </Text>

        <Input
          label="Membership Product Code"
          required
          value={draft.membershipProductCode}
          onChangeText={() => undefined}
          editable={false}
        />

        <Input
          label="Membership Product Name"
          required
          value={draft.membershipProductName}
          onChangeText={(value) => update("membershipProductName", value)}
          placeholder="e.g. Sunrise Gold Membership"
        />

        <Input
          label="Display Name"
          value={draft.displayName ?? ""}
          onChangeText={(value) =>
            update("displayName", value.trim() ? value : undefined)
          }
          placeholder="Customer-facing name"
        />

        <ReferenceSelect
          label="Product Category"
          required
          items={productCategories}
          value={draft.productCategoryId}
          onChange={(value) => update("productCategoryId", value)}
        />

        <ReferenceSelect
          label="Product Type"
          required
          items={productTypes}
          value={draft.productTypeId}
          onChange={(value) => update("productTypeId", value)}
        />

        <TextArea
          label="Description"
          value={draft.description ?? ""}
          onChangeText={(value) =>
            update("description", value.trim() ? value : undefined)
          }
          placeholder="Describe this membership..."
        />

        <ReferenceSelect
          label="Product Status"
          required
          items={productStatuses}
          value={draft.productStatusId}
          onChange={(value) => update("productStatusId", value)}
          disabled={isNewProduct}
        />

        <Input
          label="Effective Date"
          required
          value={draft.effectiveDate}
          onChangeText={(value) => update("effectiveDate", value)}
          placeholder="YYYY-MM-DD"
        />

        <Input
          label="Expiry Date"
          value={draft.expiryDate ?? ""}
          onChangeText={(value) =>
            update("expiryDate", value.trim() ? value : undefined)
          }
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text variant="body" color="text">
              Benefits *
            </Text>
            <Text variant="bodySmall" color="textMuted">
              Select the active benefits included with this membership.
            </Text>
          </View>

          <Text variant="bodySmall" color="textMuted">
            {
              draft.benefitIds.filter((id) =>
                activeBenefits.some((benefit) => benefit.id === id),
              ).length
            }{" "}
            selected
          </Text>
        </View>

        {activeBenefits.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text variant="bodySmall" color="textMuted">
              No active benefits are configured for this business yet.
            </Text>
          </View>
        ) : (
          <View style={styles.benefitList}>
            {activeBenefits.map((benefit) => {
              const selected = selectedBenefit(benefit.id);

              return (
                <Pressable
                  key={benefit.id}
                  onPress={() => toggleBenefit(benefit.id)}
                  disabled={saving}
                  style={[
                    styles.benefitItem,
                    {
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.border,
                      backgroundColor: selected
                        ? theme.colors.surface
                        : theme.colors.background,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.primary
                          : "transparent",
                      },
                    ]}
                  >
                    {selected ? (
                      <Text variant="bodySmall" color="background">
                        ✓
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.benefitText}>
                    <Text variant="body" color="text">
                      {benefit.displayName ?? benefit.benefitName}
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      {benefit.description ?? benefit.benefitCode}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text variant="body" color="text">
              Subscription Plans *
            </Text>
            <Text variant="bodySmall" color="textMuted">
              At least one subscription plan is required.
            </Text>
          </View>

          <Pressable
            onPress={addPlan}
            disabled={saving}
            style={({ pressed }) => [
              styles.addPlanButton,
              { opacity: pressed || saving ? 0.7 : 1 },
            ]}
          >
            <Text variant="body" color="background">
              + Add Plan
            </Text>
          </Pressable>
        </View>

        {draft.plans.map((plan, index) => (
          <View
            key={plan.id}
            style={[
              styles.planCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <View style={styles.planHeader}>
              <View style={styles.planHeaderText}>
                <Text variant="body" color="text">
                  Plan {index + 1}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  {plan.subscriptionPlanName || "New subscription plan"}
                </Text>
              </View>

              {draft.plans.length > 1 ? (
                <Pressable
                  onPress={() => removePlan(plan.id)}
                  disabled={saving}
                >
                  <Text variant="bodySmall" color="danger">
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Input
              label="Subscription Plan Code"
              required
              value={plan.subscriptionPlanCode}
              onChangeText={(value) =>
                updatePlan(plan.id, "subscriptionPlanCode", value)
              }
              placeholder="e.g. GOLD-MONTHLY"
            />

            <Input
              label="Subscription Plan Name"
              required
              value={plan.subscriptionPlanName}
              onChangeText={(value) =>
                updatePlan(plan.id, "subscriptionPlanName", value)
              }
              placeholder="e.g. Monthly"
            />

            <TextArea
              label="Description"
              value={plan.description ?? ""}
              onChangeText={(value) =>
                updatePlan(
                  plan.id,
                  "description",
                  value.trim() ? value : undefined,
                )
              }
              placeholder="Describe this plan..."
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Input
                  label="Subscription Period"
                  required
                  value={String(plan.subscriptionPeriod)}
                  onChangeText={(value) => {
                    const parsed = Number(value.replace(/[^0-9]/g, ""));
                    updatePlan(
                      plan.id,
                      "subscriptionPeriod",
                      Number.isFinite(parsed) ? parsed : 0,
                    );
                  }}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.half}>
                <ReferenceSelect
                  label="Period Unit"
                  required
                  items={[
                    { id: "DAY", name: "Day" },
                    { id: "MONTH", name: "Month" },
                    { id: "YEAR", name: "Year" },
                  ]}
                  value={plan.subscriptionPeriodUnit}
                  onChange={(value) =>
                    updatePlan(plan.id, "subscriptionPeriodUnit", value)
                  }
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Input
                  label="Price"
                  required
                  value={
                    priceInputs[plan.id] ??
                    (plan.price.amountMinor / 100).toFixed(2)
                  }
                  onChangeText={(value) => {
                    const cleaned = value.replace(/[^0-9.]/g, "");
                    const parts = cleaned.split(".");
                    const normalized =
                      parts.length > 2
                        ? `${parts[0]}.${parts.slice(1).join("")}`
                        : cleaned;
                    const finalValue = normalized.includes(".")
                      ? `${normalized.split(".")[0]}.${normalized
                          .split(".")[1]
                          .slice(0, 2)}`
                      : normalized;

                    setPriceInputs((current) => ({
                      ...current,
                      [plan.id]: finalValue,
                    }));
                  }}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.half}>
                <ReferenceSelect
                  label="Currency"
                  required
                  items={currencies}
                  value={plan.currencyId}
                  onChange={(value) => {
                    const currency = currencies.find(
                      (item) => item.id === value,
                    );

                    updatePlan(plan.id, "currencyId", value);
                    updatePlan(plan.id, "price", {
                      ...plan.price,
                      currency: currency?.code ?? plan.price.currency,
                    });
                  }}
                />
              </View>
            </View>

            <ReferenceSelect
              label="Plan Status"
              required
              items={subscriptionPlanStatuses}
              value={plan.subscriptionPlanStatusId}
              onChange={(value) =>
                updatePlan(plan.id, "subscriptionPlanStatusId", value)
              }
              disabled={isNewProduct || !existingPlanIds.has(plan.id)}
            />
            <Input
              label="Effective Date"
              required
              value={plan.effectiveDate}
              onChangeText={(value) =>
                updatePlan(plan.id, "effectiveDate", value)
              }
              placeholder="YYYY-MM-DD"
            />

            <Input
              label="Expiry Date"
              value={plan.expiryDate ?? ""}
              onChangeText={(value) =>
                updatePlan(
                  plan.id,
                  "expiryDate",
                  value.trim() ? value : undefined,
                )
              }
              placeholder="YYYY-MM-DD"
            />
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={({ pressed }) => [
            styles.cancelButton,
            { opacity: pressed || saving ? 0.7 : 1 },
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
            styles.saveButton,
            { opacity: pressed || saving ? 0.7 : 1 },
          ]}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save Draft"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20, paddingBottom: 24 },
  section: { gap: 14 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderText: { flex: 1, gap: 4 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  benefitList: { gap: 10 },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1, gap: 3 },
  emptyBox: { padding: 16, borderWidth: 1, borderRadius: 10 },
  addPlanButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  planHeaderText: { flex: 1, gap: 3 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
});
