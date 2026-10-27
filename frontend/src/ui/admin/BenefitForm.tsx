import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { DateInput } from "../DateInput";
import { BenefitFrequencyType } from "@/src/core";
import type {
  Benefit,
  BenefitUsageRule,
  Product,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { services } from "@/src/core";
import { apis } from "@/src/data/data-registry";

import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { Modal } from "../Modal";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { Checkbox } from "../Checkbox";
import { TextArea } from "../TextArea";
import type { CommerceProductMapping } from "@/src/data/api/benefit-commerce-api";
import {
  organizationProductApi,
  type OrganizationProduct,
  type OrganizationProductCatalog,
} from "@/src/data/api/organization-product-api";
import { CommerceStoreCatalogSourceApi } from "@/src/data/api/commerce-store-catalog-source-api";
import { CommercePricePreview } from "./CommercePricePreview";

type BenefitFormProps = {
  benefit: Benefit;
  isNew: boolean;

  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  benefitStatuses: Status[];

  products: Product[];
  commerceMappings?: CommerceProductMapping[];
  usageRules: BenefitUsageRule[];

  commerceConfiguration?: BenefitCommerceConfiguration | null;
  onSave: (
    benefit: Benefit,
    usageRules: BenefitUsageRule[],
    commerceConfiguration: BenefitCommerceConfiguration | null,
  ) => Promise<void>;
  onCancel: () => void;
};

type MoneyValue = NonNullable<Benefit["retailPrice"]>;

type BenefitCommerceConfiguration = {
  productIds: string[];
  adjustmentType: "PRODUCT_FREE" | "PRODUCT_PERCENT_OFF" | "PRODUCT_FIXED_OFF";
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
  active: boolean;
};

function commerceAdjustmentType(
  benefitTypeId: string,
  benefitTypes: ReferenceDataItem[],
): BenefitCommerceConfiguration["adjustmentType"] | null {
  switch (benefitTypes.find((type) => type.id === benefitTypeId)?.code) {
    case "FREE_ITEM":
      return "PRODUCT_FREE";
    case "PERCENTAGE":
      return "PRODUCT_PERCENT_OFF";
    case "FIXED":
      return "PRODUCT_FIXED_OFF";
    default:
      return null;
  }
}

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
  { id: "NZD" as MoneyValue["currency"], name: "NZD — New Zealand Dollar" },
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

type TimeZoneSelectProps = {
  value: string;
  items: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
};

function TimeZoneSelect({
  value,
  items,
  onChange,
  placeholder = "Select time zone",
}: TimeZoneSelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = items.find((item) => item.id === value);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);

  const openPicker = () => {
    setSearch("");
    setOpen(true);
  };

  const closePicker = () => {
    setSearch("");
    setOpen(false);
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="bodySmall" color="text">
        Time Zone
      </Text>

      <Pressable
        onPress={openPicker}
        style={({ pressed }) => ({
          minHeight: 48,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? theme.states.pressedOpacity : 1,
        })}
      >
        <Text variant="body" color={selected ? "text" : "textMuted"}>
          {selected?.name ?? placeholder}
        </Text>
        <Text variant="bodySmall" color="textMuted">
          ▾
        </Text>
      </Pressable>

      <Modal visible={open} onClose={closePicker} title="Time Zone" scrollable>
        <View style={{ gap: theme.spacing.sm }}>
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
                    closePicker();
                  }}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radius.md,
                    backgroundColor: selectedItem
                      ? theme.colors.primarySoft
                      : pressed
                        ? theme.colors.surfaceAlt
                        : "transparent",
                    justifyContent: "center",
                  })}
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
function isValidTime(value?: string): boolean {
  if (!value) {
    return true;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
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
  commerceMappings = [],
  usageRules,
  commerceConfiguration,
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
  const [commerceProductIds, setCommerceProductIds] = useState<string[]>(
    () =>
      benefit.productIds ??
      commerceConfiguration?.productIds ??
      (benefit.productId ? [benefit.productId] : []),
  );
  const [percentageInput, setPercentageInput] = useState(
    () => commerceConfiguration?.percentage?.toString() ?? "",
  );
  const [fixedAmountInput, setFixedAmountInput] = useState(() =>
    commerceConfiguration?.amountMinor !== undefined
      ? (commerceConfiguration.amountMinor / 100).toFixed(2)
      : "",
  );
  const [commerceError, setCommerceError] = useState<string | undefined>();
  const [productSearch, setProductSearch] = useState("");
  const [pickerStores, setPickerStores] = useState<Store[]>([]);
  const [pickerCatalogs, setPickerCatalogs] = useState<
    OrganizationProductCatalog[]
  >([]);
  const [pickerProducts, setPickerProducts] = useState<OrganizationProduct[]>(
    [],
  );
  const [availabilityMode, setAvailabilityMode] = useState<
    "ALL_STORES" | "SELECTED_STORES"
  >(() => benefit.storeAvailability?.mode ?? "ALL_STORES");
  const [availabilityStoreIds, setAvailabilityStoreIds] = useState<string[]>(
    () => benefit.storeAvailability?.storeIds ?? [],
  );
  const [pickerLoading, setPickerLoading] = useState(true);
  const [pickerError, setPickerError] = useState<string>();
  const [storeCatalogs, setStoreCatalogs] = useState<
    Record<string, { catalogId: string; integrationId: string; name: string }>
  >({});
  const [pickerSourceLoading, setPickerSourceLoading] = useState(false);
  const [pickerSourceError, setPickerSourceError] = useState<string>();
  const pickerSourceRequest = useRef(0);
  const catalogSourceApi = useMemo(
    () => new CommerceStoreCatalogSourceApi(),
    [],
  );

  const [touched, setTouched] = useState<Set<string>>(new Set());

  const [rulesValidationAttempted, setRulesValidationAttempted] =
    useState(false);

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
    setCommerceProductIds(
      benefit.productIds ??
        commerceConfiguration?.productIds ??
        (benefit.productId ? [benefit.productId] : []),
    );
    setPercentageInput(commerceConfiguration?.percentage?.toString() ?? "");
    setFixedAmountInput(
      commerceConfiguration?.amountMinor !== undefined
        ? (commerceConfiguration.amountMinor / 100).toFixed(2)
        : "",
    );
    setCommerceError(undefined);
    setProductSearch("");
    setAvailabilityMode(benefit.storeAvailability?.mode ?? "ALL_STORES");
    setAvailabilityStoreIds(benefit.storeAvailability?.storeIds ?? []);

    if (benefit.retailPrice?.currency) {
      setDefaultCurrency(benefit.retailPrice.currency);
    } else if (benefit.cost?.currency) {
      setDefaultCurrency(benefit.cost.currency);
    }

    setTouched(new Set());
    setRulesValidationAttempted(false);
    setRules(cloneRules(usageRules));
  }, [benefit, benefitStatuses, usageRules, commerceConfiguration]);

  useEffect(() => {
    let mounted = true;
    setPickerLoading(true);
    setPickerError(undefined);

    void Promise.all([
      apis.store.list(benefit.organizationId),
      organizationProductApi.catalogs(benefit.organizationId),
      organizationProductApi.products(benefit.organizationId),
      services.status.listStatusesByEntityTypeCode("STORE"),
    ])
      .then(([storesResult, catalogsResult, productsResult, storeStatuses]) => {
        if (!mounted) return;
        if (!storesResult.success) {
          setPickerError(
            storesResult.error?.message ??
              "Unable to load Stores for product selection.",
          );
          return;
        }
        if (!catalogsResult.success || !productsResult.success) {
          setPickerError(
            (!catalogsResult.success
              ? catalogsResult.error?.message
              : undefined) ??
              (!productsResult.success
                ? productsResult.error?.message
                : undefined) ??
              "Unable to load catalog products for product selection.",
          );
          return;
        }
        const activeStatusIds = new Set(
          storeStatuses
            .filter(
              (status) =>
                status.statusCode?.trim().toUpperCase() === "ACTIVE" &&
                status.isActive,
            )
            .map((status) => status.id),
        );
        const activeStores = storesResult.data.filter(
          (store) =>
            !store.isDeleted && activeStatusIds.has(store.storeStatusId),
        );
        setPickerStores(activeStores);
        setPickerCatalogs(catalogsResult.data);
        setPickerProducts(productsResult.data);
      })
      .catch(() => {
        if (mounted) {
          setPickerError(
            "Unable to load catalog products for product selection.",
          );
        }
      })
      .finally(() => {
        if (mounted) setPickerLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [benefit.organizationId]);

  const eligibleStores = useMemo(
    () =>
      pickerStores.filter(
        (store) =>
          availabilityMode === "ALL_STORES" ||
          availabilityStoreIds.includes(store.id),
      ),
    [pickerStores, availabilityMode, availabilityStoreIds],
  );

  useEffect(() => {
    const request = ++pickerSourceRequest.current;
    setStoreCatalogs({});
    setPickerSourceError(undefined);
    if (pickerLoading || pickerError || eligibleStores.length === 0) {
      setPickerSourceLoading(false);
      return;
    }
    setPickerSourceLoading(true);
    void Promise.all(
      eligibleStores.map(async (store) => {
        const result = await catalogSourceApi.get(
          benefit.organizationId,
          store.id,
        );
        if (!result.success)
          throw new Error(
            result.error?.message ?? `Could not load ${store.name} catalog`,
          );
        const source = result.data.source;
        const catalogId = source?.catalogId?.trim();
        const integrationId = source?.integrationConfigurationId;
        if (!catalogId || !integrationId)
          throw new Error(`No Product Catalog configured for ${store.name}`);
        const matches = pickerCatalogs.filter(
          (catalog) =>
            catalog.active &&
            catalog.integrationConfigurationId === integrationId &&
            catalog.externalCatalogId === catalogId,
        );
        if (matches.length !== 1)
          throw new Error(
            `No unique canonical Memgine catalog linked for ${store.name}`,
          );
        return [
          store.id,
          {
            catalogId: matches[0].productCatalogId,
            integrationId,
            name: source?.catalogName?.trim() || catalogId,
          },
        ] as const;
      }),
    )
      .then((rows) => {
        if (request === pickerSourceRequest.current)
          setStoreCatalogs(Object.fromEntries(rows));
      })
      .catch((error: unknown) => {
        if (request === pickerSourceRequest.current) {
          setStoreCatalogs({});
          setPickerSourceError(
            error instanceof Error
              ? error.message
              : "Unable to load Store catalogs",
          );
        }
      })
      .finally(() => {
        if (request === pickerSourceRequest.current)
          setPickerSourceLoading(false);
      });
    return () => {
      pickerSourceRequest.current += 1;
    };
  }, [
    benefit.organizationId,
    catalogSourceApi,
    pickerCatalogs,
    eligibleStores,
    pickerLoading,
    pickerError,
  ]);

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

  const getRuleStartTimeError = (
    rule: BenefitUsageRule,
  ): string | undefined => {
    if (!rulesValidationAttempted) {
      return undefined;
    }

    if (!isValidTime(rule.windowStartTime)) {
      return "Enter time as HH:MM, for example 09:30.";
    }

    return undefined;
  };

  const getRuleEndTimeError = (rule: BenefitUsageRule): string | undefined => {
    if (!rulesValidationAttempted) {
      return undefined;
    }

    if (!isValidTime(rule.windowEndTime)) {
      return "Enter time as HH:MM, for example 17:30.";
    }

    if (
      rule.windowStartTime &&
      rule.windowEndTime &&
      isValidTime(rule.windowStartTime) &&
      isValidTime(rule.windowEndTime) &&
      rule.windowEndTime <= rule.windowStartTime
    ) {
      return "End Time must be later than Start Time.";
    }

    return undefined;
  };

  const selectedAdjustmentType = commerceAdjustmentType(
    form.benefitTypeId,
    benefitTypes,
  );
  const selectedAdjustmentLabel =
    selectedAdjustmentType === "PRODUCT_FREE"
      ? "Free Item"
      : selectedAdjustmentType === "PRODUCT_PERCENT_OFF"
        ? "Percentage Off"
        : selectedAdjustmentType === "PRODUCT_FIXED_OFF"
          ? "Fixed Amount Off"
          : "";
  const productById = useMemo(() => {
    const byId = new Map<string, Product>();
    products.forEach((product) => byId.set(product.id, product));
    pickerProducts.forEach((product) => {
      if (!byId.has(product.productId)) {
        byId.set(product.productId, {
          id: product.productId,
          organizationId: product.organizationId,
          productCode: product.productCode,
          productName: product.productName,
          description: product.description ?? undefined,
          statusId: product.active ? "ACTIVE" : "INACTIVE",
          createdAt: "",
          createdBy: "",
          updatedAt: "",
          updatedBy: "",
          isDeleted: !product.active,
          versionNo: product.versionNo,
        });
      }
    });
    return byId;
  }, [pickerProducts, products]);
  const pickerProductById = useMemo(
    () =>
      new Map(pickerProducts.map((product) => [product.productId, product])),
    [pickerProducts],
  );
  // W223/W224 manual relinks can point a Store mapping at a canonical Product
  // owned by another Memgine catalog. Eligibility is determined by the active
  // Store + integration mapping, NOT by the canonical Product's home catalog.
  const eligibleProductStores = useMemo(() => {
    const byProduct = new Map<string, string[]>();
    const storesById = new Map(pickerStores.map((store) => [store.id, store]));
    const activeProducts = new Set(
      pickerProducts
        .filter((product) => product.active)
        .map((product) => product.productId),
    );
    for (const mapping of commerceMappings) {
      const storeId = mapping.storeId ?? "";
      const source = storeCatalogs[storeId];
      if (
        !mapping.active ||
        !mapping.productId ||
        !activeProducts.has(mapping.productId) ||
        !source ||
        mapping.integrationConfigurationId !== source.integrationId
      )
        continue;
      const storeName = storesById.get(storeId)?.name;
      if (!storeName) continue;
      const names = byProduct.get(mapping.productId) ?? [];
      if (!names.includes(storeName)) names.push(storeName);
      byProduct.set(mapping.productId, names);
    }
    for (const names of byProduct.values()) {
      names.sort((left, right) => left.localeCompare(right));
    }
    return byProduct;
  }, [commerceMappings, pickerProducts, pickerStores, storeCatalogs]);

  // A canonical Product must appear only once, regardless of how many Stores
  // expose it through distinct catalog-qualified mappings.
  const currentCatalogProducts = useMemo(
    () =>
      pickerProducts.filter(
        (product) =>
          product.active && eligibleProductStores.has(product.productId),
      ),
    [pickerProducts, eligibleProductStores],
  );
  const normalizedProductName = (name?: string | null) =>
    name?.trim().toLocaleLowerCase() ?? "";
  const duplicateProductNames = useMemo(() => {
    const counts = new Map<string, number>();
    currentCatalogProducts.forEach((product) => {
      const name = normalizedProductName(product.productName);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return counts;
  }, [currentCatalogProducts]);
  const productPickerLabel = (productId: string, fallback?: Product) => {
    const product = pickerProductById.get(productId);
    const name =
      product?.productName ??
      fallback?.productName ??
      "Previously selected product";
    if ((duplicateProductNames.get(normalizedProductName(name)) ?? 0) < 2) {
      return name;
    }

    const categoryName = product?.categoryName?.trim();
    const matchingCategoryCount = currentCatalogProducts.filter(
      (candidate) =>
        normalizedProductName(candidate.productName) ===
          normalizedProductName(name) &&
        candidate.categoryName?.trim().toLocaleLowerCase() ===
          categoryName?.toLocaleLowerCase(),
    ).length;
    const qualifier = categoryName ? [categoryName] : [];
    if (matchingCategoryCount > 1) {
      const productAttribute =
        product?.sku?.trim() ||
        product?.upc?.trim() ||
        product?.productCode?.trim();
      if (productAttribute) qualifier.push(`SKU ${productAttribute}`);
    }
    return qualifier.length ? `${name} (${qualifier.join(" · ")})` : name;
  };
  const selectedProducts = useMemo(
    () =>
      commerceProductIds.map((productId) => ({
        id: productId,
        product: productById.get(productId),
      })),
    [commerceProductIds, productById],
  );
  const selectedCatalogProductIds = useMemo(
    () => new Set(currentCatalogProducts.map((product) => product.productId)),
    [currentCatalogProducts],
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    const seen = new Set<string>();
    return currentCatalogProducts.filter((product) => {
      if (
        commerceProductIds.includes(product.productId) ||
        seen.has(product.productId)
      ) {
        return false;
      }
      seen.add(product.productId);
      return (
        !query ||
        `${product.productName} ${product.productCode}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [commerceProductIds, currentCatalogProducts, productSearch]);
  const toggleCommerceProduct = (productId: string) =>
    setCommerceProductIds((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      update("productId", next[0] || undefined);
      return next;
    });
  const currentCommerceConfiguration =
    (): BenefitCommerceConfiguration | null => {
      if (!selectedAdjustmentType) return null;
      if (!commerceProductIds.length)
        throw new Error("Select at least one POS Product.");
      if (selectedAdjustmentType === "PRODUCT_PERCENT_OFF") {
        const percentage = Number(percentageInput);
        if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)
          throw new Error("Percentage must be greater than 0 and at most 100.");
        return {
          productIds: commerceProductIds,
          adjustmentType: selectedAdjustmentType,
          percentage,
          active: true,
        };
      }
      if (selectedAdjustmentType === "PRODUCT_FIXED_OFF") {
        const amount = Number(fixedAmountInput);
        if (!Number.isFinite(amount) || amount <= 0)
          throw new Error("Fixed amount must be greater than 0.");
        return {
          productIds: commerceProductIds,
          adjustmentType: selectedAdjustmentType,
          amountMinor: Math.round(amount * 100),
          currencyCode: defaultCurrency,
          active: true,
        };
      }
      return {
        productIds: commerceProductIds,
        adjustmentType: selectedAdjustmentType,
        active: true,
      };
    };
  const validate = () => {
    const requiredFields = [
      "benefitName",
      "benefitCategoryId",
      "benefitTypeId",
      "effectiveDate",
    ];

    setTouched(new Set(requiredFields));
    setRulesValidationAttempted(true);

    const validRules = rules.every(
      (rule) =>
        rule.frequencyInterval >= 1 &&
        rule.usageLimit >= 1 &&
        isValidTime(rule.windowStartTime) &&
        isValidTime(rule.windowEndTime) &&
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
      (availabilityMode === "ALL_STORES" || availabilityStoreIds.length > 0) &&
      (!selectedAdjustmentType ||
        (commerceProductIds.length > 0 &&
          !pickerLoading &&
          !pickerSourceLoading &&
          !pickerError &&
          !pickerSourceError &&
          commerceProductIds.every((id) =>
            selectedCatalogProductIds.has(id),
          ))) &&
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
      if (
        selectedAdjustmentType &&
        commerceProductIds.some((id) => !selectedCatalogProductIds.has(id))
      ) {
        setCommerceError(
          "One or more selected Products are not available in the selected Stores. Remove them before saving.",
        );
      }
      return;
    }

    setSaving(true);

    try {
      let configuration: BenefitCommerceConfiguration | null;
      try {
        configuration = currentCommerceConfiguration();
        setCommerceError(undefined);
      } catch (error) {
        setCommerceError(
          error instanceof Error
            ? error.message
            : "Invalid Commerce configuration.",
        );
        return;
      }
      await onSave(
        {
          ...form,
          productIds: commerceProductIds,
          productId: [...commerceProductIds].sort()[0],
          storeAvailability: {
            mode: availabilityMode,
            storeIds:
              availabilityMode === "SELECTED_STORES"
                ? availabilityStoreIds
                : [],
          },
          disclaimerText: form.disclaimerText?.trim() || undefined,
        },
        rules.map((rule) => ({
          ...rule,
          ruleName:
            rule.ruleName.trim() ||
            `${form.benefitName.trim() || "Benefit"} Usage Rule`,
          effectiveDate: rule.effectiveDate || form.effectiveDate,
          expiryDate: rule.expiryDate || form.expiryDate,
        })),
        configuration,
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
          <View style={styles.fullWidth}>
            <View style={styles.storeAvailability}>
              <Text variant="bodyStrong" color="text">
                Store Availability
              </Text>
              <Text variant="bodySmall" color="textMuted">
                Choose where this Benefit can be redeemed. Products below are
                automatically filtered to these Stores.
              </Text>
              <Pressable
                onPress={() => setAvailabilityMode("ALL_STORES")}
                style={[
                  styles.availabilityChoice,
                  availabilityMode === "ALL_STORES" &&
                    styles.availabilityChoiceSelected,
                ]}
              >
                <Text variant="body" color="text">
                  {availabilityMode === "ALL_STORES" ? "●" : "○"} All active
                  Stores
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAvailabilityMode("SELECTED_STORES")}
                style={[
                  styles.availabilityChoice,
                  availabilityMode === "SELECTED_STORES" &&
                    styles.availabilityChoiceSelected,
                ]}
              >
                <Text variant="body" color="text">
                  {availabilityMode === "SELECTED_STORES" ? "●" : "○"} Selected
                  Stores
                </Text>
              </Pressable>
              {availabilityMode === "SELECTED_STORES" ? (
                <View style={styles.availableStores}>
                  {pickerLoading ? (
                    <Text variant="bodySmall" color="textMuted">
                      Loading active Stores…
                    </Text>
                  ) : pickerStores.length ? (
                    pickerStores.map((store) => {
                      const selected = availabilityStoreIds.includes(store.id);
                      return (
                        <Checkbox
                          key={store.id}
                          value={selected}
                          label={store.name}
                          onValueChange={() =>
                            setAvailabilityStoreIds((current) =>
                              selected
                                ? current.filter((id) => id !== store.id)
                                : [...current, store.id],
                            )
                          }
                        />
                      );
                    })
                  ) : (
                    <Text variant="bodySmall" color="danger">
                      No active Stores are available for selection.
                    </Text>
                  )}
                  {!availabilityStoreIds.length ? (
                    <Text variant="bodySmall" color="danger">
                      Select at least one Store.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {selectedAdjustmentType ? (
            <View style={styles.fullWidth}>
              <Input
                label="POS Adjustment"
                value={selectedAdjustmentLabel}
                editable={false}
                onChangeText={() => {}}
              />

              <Text variant="bodySmall" color="textMuted">
                Derived automatically from the selected Benefit Type.
              </Text>

              <Text variant="bodySmall" color="text">
                POS Products *
              </Text>

              <Text variant="bodySmall" color="textMuted">
                Choose the Products this Benefit applies to.
              </Text>
              <Text variant="bodySmall" color="textMuted">
                Each Product appears once. Store availability is based on active
                POS mappings for the {eligibleStores.length} selected Store(s).
              </Text>
              {pickerLoading || pickerSourceLoading ? (
                <Text variant="bodySmall" color="textMuted">
                  Loading eligible Store catalogs…
                </Text>
              ) : null}
              {pickerError || pickerSourceError ? (
                <Text variant="bodySmall" color="danger">
                  {pickerError || pickerSourceError}
                </Text>
              ) : null}
              {selectedProducts.length ? (
                <View style={styles.selectedProducts}>
                  <Text variant="bodySmall" color="text">
                    Selected Products
                  </Text>
                  {selectedProducts.map(({ id, product }) => {
                    const inCurrentCatalog = selectedCatalogProductIds.has(id);
                    return (
                      <Checkbox
                        key={id}
                        value
                        onValueChange={() => toggleCommerceProduct(id)}
                        label={productPickerLabel(id, product)}
                        description={
                          inCurrentCatalog
                            ? `Available at: ${(eligibleProductStores.get(id) ?? []).join(", ")}`
                            : "Not available at any selected Store — remove before saving"
                        }
                      />
                    );
                  })}
                </View>
              ) : null}
              <Input
                label="Search products"
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search product names"
                editable={
                  !pickerLoading &&
                  !pickerSourceLoading &&
                  !pickerError &&
                  !pickerSourceError &&
                  eligibleStores.length > 0
                }
              />
              <ScrollView style={styles.productList} nestedScrollEnabled>
                {!pickerLoading &&
                !pickerSourceLoading &&
                !pickerSourceError &&
                !filteredProducts.length ? (
                  <Text variant="bodySmall" color="textMuted">
                    No additional eligible Products match the selected Stores
                    and search.
                  </Text>
                ) : null}
                {filteredProducts.map((product) => (
                  <Checkbox
                    key={product.productId}
                    value={false}
                    onValueChange={() =>
                      toggleCommerceProduct(product.productId)
                    }
                    label={productPickerLabel(product.productId)}
                    description={`Available at: ${(eligibleProductStores.get(product.productId) ?? []).join(", ")}`}
                  />
                ))}
              </ScrollView>
              {selectedAdjustmentType === "PRODUCT_PERCENT_OFF" ? (
                <Input
                  label="Percentage"
                  value={percentageInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 20"
                  error={commerceError}
                  onChangeText={setPercentageInput}
                />
              ) : null}
              {selectedAdjustmentType === "PRODUCT_FIXED_OFF" ? (
                <Input
                  label={`Fixed amount off (${defaultCurrency})`}
                  value={fixedAmountInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 5.00"
                  error={commerceError}
                  onChangeText={setFixedAmountInput}
                />
              ) : null}
              <CommercePricePreview
                productIds={commerceProductIds}
                productName={(productId) =>
                  productPickerLabel(productId, productById.get(productId))
                }
                mappings={commerceMappings}
                storeContexts={eligibleStores.flatMap((store) => {
                  const source = storeCatalogs[store.id];
                  return source
                    ? [
                        {
                          storeId: store.id,
                          storeName: store.name,
                          integrationConfigurationId: source.integrationId,
                          catalogSourceName: source.name,
                        },
                      ]
                    : [];
                })}
                adjustment={
                  selectedAdjustmentType
                    ? {
                        adjustmentType: selectedAdjustmentType,
                        percentage: Number(percentageInput) || 0,
                        amountMinor: Math.round(
                          (Number(fixedAmountInput) || 0) * 100,
                        ),
                        currencyCode: commerceConfiguration?.currencyCode,
                      }
                    : null
                }
              />
              {commerceError ? (
                <Text variant="bodySmall" color="danger">
                  {commerceError}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.field}>
              <ReferenceSelect<Product>
                label="Product"
                value={form.productId ?? ""}
                items={products}
                placeholder="Please select"
                allowClear
                getItemId={(item) => item.id}
                renderItemLabel={(item) =>
                  item.productName
                    ? `${item.productName}${item.productCode ? ` (${item.productCode})` : ""}`
                    : item.productCode
                }
                onChange={(value) => update("productId", value || undefined)}
              />
            </View>
          )}

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

        <TextArea
          label="Disclaimer / Terms"
          value={form.disclaimerText ?? ""}
          placeholder="Optional customer-facing terms or restrictions"
          maxLength={500}
          onChangeText={(value) => update("disclaimerText", value || undefined)}
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
              disabled
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
                    error={getRuleStartTimeError(rule)}
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
                    error={getRuleEndTimeError(rule)}
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
                  <TimeZoneSelect
                    value={rule.timeZone ?? ""}
                    items={timeZoneOptions}
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
                  <DateInput
                    label="Effective Date"
                    value={rule.effectiveDate}
                    onChange={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, effectiveDate: value ?? "" }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.field}>
                  <DateInput
                    label="Expiry Date"
                    value={rule.expiryDate}
                    minimumDate={rule.effectiveDate}
                    onChange={(value) =>
                      setRules((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, expiryDate: value }
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
            <DateInput
              label="Effective Date"
              value={form.effectiveDate}
              required
              error={errors.effectiveDate}
              onChange={(value) => {
                update("effectiveDate", value ?? "");
                markTouched("effectiveDate");
              }}
            />
          </View>

          <View style={styles.field}>
            <DateInput
              label="Expiry Date"
              value={form.expiryDate}
              minimumDate={form.effectiveDate}
              onChange={(value) => update("expiryDate", value)}
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
  selectedProducts: {
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },
  storeAvailability: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },
  availabilityChoice: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },
  availabilityChoiceSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  availableStores: {
    gap: 10,
    paddingTop: 2,
  },
  productList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 10,
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
