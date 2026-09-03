import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Benefit, Product, ReferenceDataItem, Status } from "@/src/core";

import { services } from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { TextArea } from "../TextArea";

type BenefitFormProps = {
  benefit: Benefit;

  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  benefitStatuses: Status[];

  products: Product[];

  onSave: (benefit: Benefit) => Promise<void>;
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

function moneyToInput(value?: MoneyValue): string {
  if (!value) {
    return "";
  }

  return (value.amountMinor / 100).toFixed(2);
}

export function BenefitForm({
  benefit,
  benefitCategories,
  benefitTypes,
  benefitStatuses,
  products,
  onSave,
  onCancel,
}: BenefitFormProps) {
  const theme = useTheme();

  const [form, setForm] = useState<Benefit>(() => ({
    ...benefit,
    benefitStatusId: getActiveStatusId(
      benefitStatuses,
      benefit.benefitStatusId,
    ),
  }));

  const [saving, setSaving] = useState(false);

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
  }, [benefit, benefitStatuses]);

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

    return (
      form.benefitName.trim().length > 0 &&
      form.benefitCategoryId.length > 0 &&
      form.benefitTypeId.length > 0 &&
      form.effectiveDate.trim().length > 0
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
      await onSave({
        ...form,
        benefitStatusId: getActiveStatusId(
          benefitStatuses,
          form.benefitStatusId,
        ),
      });
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
              disabled
              onChange={() => {
                /* Status is system-managed for this form. */
              }}
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
