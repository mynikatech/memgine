import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { BenefitFrequencyType } from "@/src/core";
import type {
  Benefit,
  BenefitUsageRule,
  Product,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { TextArea } from "../TextArea";

type BenefitFormProps = {
  benefit: Benefit;
  isNew: boolean;

  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  benefitStatuses: Status[];

  products: Product[];
  usageRules: BenefitUsageRule[];

  onSave: (benefit: Benefit, usageRules: BenefitUsageRule[]) => Promise<void>;
  onCancel: () => void;
};

type MoneyValue = NonNullable<Benefit["retailPrice"]>;

const CURRENCIES: Array<{
  id: MoneyValue["currency"];
  name: string;
}> = [
  { id: "CAD" as MoneyValue["currency"], name: "CAD — Canadian Dollar" },
  { id: "USD" as MoneyValue["currency"], name: "USD — US Dollar" },
  { id: "GBP" as MoneyValue["currency"], name: "GBP — Pound Sterling" },
  { id: "EUR" as MoneyValue["currency"], name: "EUR — Euro" },
  { id: "AUD" as MoneyValue["currency"], name: "AUD — Australian Dollar" },
  { id: "INR" as MoneyValue["currency"], name: "INR — Indian Rupee" },
  { id: "SGD" as MoneyValue["currency"], name: "SGD — Singapore Dollar" },
  { id: "AED" as MoneyValue["currency"], name: "AED — UAE Dirham" },
];

const COUNTRY_CURRENCY: Record<string, MoneyValue["currency"]> = {
  CA: "CAD" as MoneyValue["currency"],
  US: "USD" as MoneyValue["currency"],
  GB: "GBP" as MoneyValue["currency"],
  UK: "GBP" as MoneyValue["currency"],
  IN: "INR" as MoneyValue["currency"],
  AU: "AUD" as MoneyValue["currency"],
  SG: "SGD" as MoneyValue["currency"],
  AE: "AED" as MoneyValue["currency"],
  NZ: "NZD" as MoneyValue["currency"],
};

function getActiveStatusId(statuses: Status[], fallback: string): string {
  return (
    statuses.find(
      (status) =>
        status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
        status.statusName?.trim().toLowerCase() === "active",
    )?.id ?? fallback
  );
}

function createMoney(
  currency: MoneyValue["currency"],
  amount: string,
): MoneyValue | undefined {
  const normalized = amount.trim();

  if (!normalized) {
    return undefined;
  }

  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return {
    currency,
    amountMinor: Math.round(numeric * 100),
  };
}

const FREQUENCY_OPTIONS: Array<{ id: BenefitFrequencyType; name: string }> = [
  { id: BenefitFrequencyType.DAILY, name: "Daily" },
  { id: BenefitFrequencyType.WEEKLY, name: "Weekly" },
  { id: BenefitFrequencyType.MONTHLY, name: "Monthly" },
  { id: BenefitFrequencyType.YEARLY, name: "Yearly" },
  { id: BenefitFrequencyType.ONE_TIME, name: "One Time" },
];

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

  return zones.map((zone) => ({ id: zone, name: zone }));
}

function createUsageRule(benefit: Benefit): BenefitUsageRule {
  const now = new Date().toISOString();
  return {
    id: `benefit-rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    benefitId: benefit.id,
    ruleName: `${benefit.benefitName || "Benefit"} Usage Rule`,
    frequencyType: BenefitFrequencyType.DAILY,
    frequencyInterval: 1,
    usageLimit: 1,
    effectiveDate: benefit.effectiveDate,
    expiryDate: benefit.expiryDate,
    benefitUsageRuleStatusId: benefit.benefitStatusId,
    createdAt: now,
    createdBy: benefit.createdBy,
    updatedAt: now,
    updatedBy: benefit.updatedBy,
    isDeleted: false,
    versionNo: 1,
  };
}

function cloneRules(rules: BenefitUsageRule[]): BenefitUsageRule[] {
  return rules.map((rule) => ({
    ...rule,
    applicableDays: rule.applicableDays ? [...rule.applicableDays] : undefined,
  }));
}

function moneyToInput(value?: MoneyValue): string {
  if (!value) {
    return "";
  }

  return (value.amountMinor / 100).toFixed(2);
}

export function BenefitForm({
  benefit,
  isNew,
  benefitCategories,
  benefitTypes,
  benefitStatuses,
  products,
  usageRules,
  onSave,
  onCancel,
}: BenefitFormProps) {
  const theme = useTheme();
  const timeZoneOptions = useMemo(getTimeZoneOptions, []);

  const [form, setForm] = useState<Benefit>(() => ({
    ...benefit,
    benefitStatusId: getActiveStatusId(
      benefitStatuses,
      benefit.benefitStatusId,
    ),
  }));

  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<BenefitUsageRule[]>(() =>
    cloneRules(usageRules),
  );

  const [productsLoading, setProductsLoading] = useState(false);

  const [defaultCurrency, setDefaultCurrency] = useState<
    MoneyValue["currency"]
  >(
    benefit.retailPrice?.currency ??
      benefit.cost?.currency ??
      ("CAD" as MoneyValue["currency"]),
  );

  const [retailPriceInput, setRetailPriceInput] = useState(
    moneyToInput(benefit.retailPrice),
  );

  const [costInput, setCostInput] = useState(moneyToInput(benefit.cost));

  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    setForm({
      ...benefit,
      benefitStatusId: getActiveStatusId(
        benefitStatuses,
        benefit.benefitStatusId,
      ),
    });

    setRetailPriceInput(moneyToInput(benefit.retailPrice));
    setCostInput(moneyToInput(benefit.cost));

    if (benefit.retailPrice?.currency) {
      setDefaultCurrency(benefit.retailPrice.currency);
    } else if (benefit.cost?.currency) {
      setDefaultCurrency(benefit.cost.currency);
    }

    setTouched(new Set());
    setRules(cloneRules(usageRules));
  }, [benefit, benefitStatuses, usageRules]);

  /*
   * Product is a real organization-owned business entity.
   *
   * The screen normally supplies the list, but keeping this small fallback
   * makes the form safe if a caller opens it before products have loaded.
   */
  useEffect(() => {
    if (products.length || productsLoading) {
      return;
    }

    let mounted = true;

    async function loadProducts() {
      setProductsLoading(true);

      try {
        await services.product.listProducts(benefit.organizationId);
      } catch {
        // The parent screen remains the source of the Product list.
      } finally {
        if (mounted) {
          setProductsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      mounted = false;
    };
  }, [benefit.organizationId, products.length, productsLoading]);

  /*
   * Default currency comes from the organization's business country.
   *
   * OrganizationDetails.address.countryCode is the business location,
   * not the customer's phone country.
   */
  useEffect(() => {
    if (benefit.retailPrice?.currency || benefit.cost?.currency) {
      return;
    }

    let mounted = true;

    async function loadBusinessCurrency() {
      try {
        const details = await services.organization.getOrganizationDetails(
          benefit.organizationId,
        );

        const countryCode = details?.address.countryCode?.trim().toUpperCase();

        if (!mounted || !countryCode) {
          return;
        }

        const currency = COUNTRY_CURRENCY[countryCode];

        if (currency) {
          setDefaultCurrency(currency);
        }
      } catch {
        // CAD remains the safe UI fallback.
      }
    }

    void loadBusinessCurrency();

    return () => {
      mounted = false;
    };
  }, [
    benefit.organizationId,
    benefit.retailPrice?.currency,
    benefit.cost?.currency,
  ]);

  const update = <K extends keyof Benefit>(field: K, value: Benefit[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const markTouched = (field: string) => {
    setTouched((current) => {
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };

  const isTouched = (field: string) => touched.has(field);

  const errors = useMemo(() => {
    return {
      benefitName:
        !form.benefitName.trim() && isTouched("benefitName")
          ? "Benefit Name is required."
          : undefined,

      benefitCategoryId:
        !form.benefitCategoryId && isTouched("benefitCategoryId")
          ? "Benefit Category is required."
          : undefined,

      benefitTypeId:
        !form.benefitTypeId && isTouched("benefitTypeId")
          ? "Benefit Type is required."
          : undefined,

      effectiveDate:
        !form.effectiveDate.trim() && isTouched("effectiveDate")
          ? "Effective Date is required."
          : undefined,
    };
  }, [
    form.benefitName,
    form.benefitCategoryId,
    form.benefitTypeId,
    form.effectiveDate,
    touched,
  ]);

  const validate = () => {
    const requiredFields = [
      "benefitName",
      "benefitCategoryId",
      "benefitTypeId",
      "effectiveDate",
    ];

    setTouched(new Set(requiredFields));

    const validRules = rules.every(
      (rule) =>
        rule.frequencyInterval >= 1 &&
        rule.usageLimit >= 1 &&
        (!rule.windowStartTime ||
          !rule.windowEndTime ||
          rule.windowEndTime > rule.windowStartTime) &&
        (!rule.effectiveDate ||
          !rule.expiryDate ||
          rule.expiryDate >= rule.effectiveDate),
    );

    return (
      form.benefitName.trim().length > 0 &&
      form.benefitCategoryId.length > 0 &&
      form.benefitTypeId.length > 0 &&
      form.effectiveDate.trim().length > 0 &&
      validRules
    );
  };

  const handleRetailPriceChange = (value: string) => {
    setRetailPriceInput(value);

    update("retailPrice", createMoney(defaultCurrency, value));
  };

  const handleCostChange = (value: string) => {
    setCostInput(value);

    update("cost", createMoney(defaultCurrency, value));
  };

  const handleCurrencyChange = (currency: MoneyValue["currency"]) => {
    setDefaultCurrency(currency);

    if (retailPriceInput.trim()) {
      update("retailPrice", createMoney(currency, retailPriceInput));
    }

    if (costInput.trim()) {
      update("cost", createMoney(currency, costInput));
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);

    try {
      await onSave(
        { ...form },
        rules.map((rule) => ({
          ...rule,
          ruleName:
            rule.ruleName.trim() ||
            `${form.benefitName.trim() || "Benefit"} Usage Rule`,
          effectiveDate: rule.effectiveDate || form.effectiveDate,
          expiryDate: rule.expiryDate || form.expiryDate,
        })),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ------------------------------------------------------------------ */}
      {/* BENEFIT INFORMATION                                                */}
      {/* ------------------------------------------------------------------ */}

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
              editable={false}
              required
              onChangeText={() => {}}
            />
          </View>

          {/* Benefit Name */}
          <View style={styles.field}>
            <Input
              label="Benefit Name"
              value={form.benefitName}
              placeholder="e.g. 10% Pastry Discount"
              required
              error={errors.benefitName}
              onChangeText={(value) => update("benefitName", value)}
              onBlur={() => markTouched("benefitName")}
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

          {/* Benefit Category */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Category"
              value={form.benefitCategoryId}
              items={benefitCategories}
              placeholder="Please select"
              required
              error={errors.benefitCategoryId}
              onChange={(value) => {
                update("benefitCategoryId", value);
                markTouched("benefitCategoryId");
              }}
            />
          </View>

          {/* Benefit Type */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Type"
              value={form.benefitTypeId}
              items={benefitTypes}
              placeholder="Please select"
              required
              error={errors.benefitTypeId}
              onChange={(value) => {
                update("benefitTypeId", value);
                markTouched("benefitTypeId");
              }}
            />
          </View>

          {/* Product */}
          <View style={styles.field}>
            <ReferenceSelect<Product>
              label="Product"
              value={form.productId ?? ""}
              items={products}
              placeholder={
                productsLoading ? "Loading products..." : "Please select"
              }
              allowClear
              disabled={productsLoading}
              getItemId={(item) => item.id}
              renderItemLabel={(item) =>
                item.productName
                  ? `${item.productName}${
                      item.productCode ? ` (${item.productCode})` : ""
                    }`
                  : item.productCode
              }
              onChange={(value) => update("productId", value || undefined)}
            />
          </View>

          {/* Status */}
          <View style={styles.field}>
            <ReferenceSelect
              label="Benefit Status"
              value={form.benefitStatusId}
              items={benefitStatuses}
              placeholder="Active"
              required
              disabled={isNew}
              onChange={(value) => update("benefitStatusId", value)}
            />
          </View>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* DESCRIPTION                                                         */}
      {/* ------------------------------------------------------------------ */}

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

      {/* ------------------------------------------------------------------ */}
      {/* COMMERCIAL                                                          */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Commercial
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <ReferenceSelect
              label="Currency"
              value={defaultCurrency}
              items={CURRENCIES}
              renderItemLabel={(item) => item.name}
              onChange={(value) =>
                handleCurrencyChange(value as MoneyValue["currency"])
              }
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Retail Price"
              value={retailPriceInput}
              placeholder="Optional"
              keyboardType="decimal-pad"
              onChangeText={handleRetailPriceChange}
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Cost"
              value={costInput}
              placeholder="Optional"
              keyboardType="decimal-pad"
              onChangeText={handleCostChange}
            />
          </View>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* USAGE RULES                                                         */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.section}>
        <View style={styles.ruleHeader}>
          <View style={styles.ruleHeaderText}>
            <Text variant="title" color="text">
              Usage Rules
            </Text>
            <Text variant="bodySmall" color="textMuted">
              Define when and how often this benefit can be redeemed.
            </Text>
          </View>
          <Pressable
            onPress={() =>
              setRules((current) => [...current, createUsageRule(form)])
            }
            style={[
              styles.addRuleButton,
              { borderColor: theme.colors.primary },
            ]}
          >
            <Text variant="body" color="primary">
              + Add Rule
            </Text>
          </Pressable>
        </View>

        {rules.length === 0 ? (
          <View style={styles.ruleEmpty}>
            <Text variant="bodySmall" color="textMuted">
              No usage restriction configured. This benefit can be redeemed
              without a frequency or time-window rule.
            </Text>
          </View>
        ) : (
          rules.map((rule, index) => (
            <View key={rule.id} style={styles.ruleCard}>
              <View style={styles.ruleCardHeader}>
                <Text variant="body" color="text">
                  Rule {index + 1}
                </Text>
                <Pressable
                  onPress={() =>
                    setRules((current) =>
                      current.filter((item) => item.id !== rule.id),
                    )
                  }
                  hitSlop={8}
                >
                  <Text variant="body" color="danger">
                    Remove
                  </Text>
                </Pressable>
              </View>

              <View style={styles.grid}>
                <View style={styles.field}>
                  <Input
                    label="Rule Name"
                    value={rule.ruleName}
                    placeholder="e.g. Daily Coffee Rule"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, ruleName: value }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <ReferenceSelect
                    label="Frequency"
                    value={rule.frequencyType}
                    items={FREQUENCY_OPTIONS}
                    renderItemLabel={(item) => item.name}
                    onChange={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                frequencyType: value as BenefitFrequencyType,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Frequency Interval"
                    value={String(rule.frequencyInterval)}
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                frequencyInterval: Math.max(
                                  1,
                                  Number(value) || 1,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Usage Limit"
                    value={String(rule.usageLimit)}
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                usageLimit: Math.max(1, Number(value) || 1),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Start Time"
                    value={rule.windowStartTime ?? ""}
                    placeholder="HH:MM (optional)"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, windowStartTime: value || undefined }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="End Time"
                    value={rule.windowEndTime ?? ""}
                    placeholder="HH:MM (optional)"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, windowEndTime: value || undefined }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <ReferenceSelect
                    label="Time Zone"
                    value={rule.timeZone ?? ""}
                    items={timeZoneOptions}
                    placeholder="Select time zone"
                    allowClear
                    renderItemLabel={(item) => item.name}
                    onChange={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, timeZone: value || undefined }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.fullWidth}>
                  <Text variant="bodySmall" color="textMuted">
                    Applicable Days
                  </Text>
                  <View style={styles.dayRow}>
                    {DAY_OPTIONS.map((day) => {
                      const selected =
                        rule.applicableDays?.includes(day.id) ?? false;
                      return (
                        <Pressable
                          key={day.id}
                          onPress={() =>
                            setRules((current) =>
                              current.map((item) => {
                                if (item.id !== rule.id) return item;
                                const days = new Set(item.applicableDays ?? []);
                                if (days.has(day.id)) days.delete(day.id);
                                else days.add(day.id);
                                const ordered = DAY_OPTIONS.map(
                                  (option) => option.id,
                                ).filter((id) => days.has(id));
                                // Keep all seven days explicitly selected. Collapsing
                                // seven selections to undefined makes the UI appear
                                // to deselect every day when Sunday is tapped.
                                return {
                                  ...item,
                                  applicableDays:
                                    ordered.length === 0 ? undefined : ordered,
                                };
                              }),
                            )
                          }
                          style={[
                            styles.dayChip,
                            {
                              backgroundColor: selected
                                ? theme.colors.primary
                                : theme.colors.surfaceAlt,
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
                </View>
                <View style={styles.field}>
                  <Input
                    label="Effective Date"
                    value={rule.effectiveDate}
                    placeholder="YYYY-MM-DD"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, effectiveDate: value }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Expiry Date"
                    value={rule.expiryDate ?? ""}
                    placeholder="YYYY-MM-DD (optional)"
                    onChangeText={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, expiryDate: value || undefined }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* VALIDITY                                                            */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Validity
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Effective Date"
              value={form.effectiveDate}
              placeholder="YYYY-MM-DD"
              required
              error={errors.effectiveDate}
              onChangeText={(value) => update("effectiveDate", value)}
              onBlur={() => markTouched("effectiveDate")}
            />
          </View>

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

      {/* ------------------------------------------------------------------ */}
      {/* ACTIONS                                                             */}
      {/* ------------------------------------------------------------------ */}

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

  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  ruleHeaderText: { flex: 1, gap: 4 },
  ruleCard: {
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
  },
  ruleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ruleEmpty: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 12,
  },
  addRuleButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  dayChip: {
    minWidth: 48,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  field: {
    width: "48%",
    minWidth: 260,
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
