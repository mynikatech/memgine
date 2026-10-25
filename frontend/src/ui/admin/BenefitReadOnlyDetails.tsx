import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import type { Benefit, BenefitUsageRule, Store } from "@/src/core";
import { Text } from "@/src/ui";
import { apis } from "@/src/data/data-registry";
import {
  organizationProductApi,
  type OrganizationProduct,
  type OrganizationProductCatalog,
  type OrganizationCommerceProductMapping,
} from "@/src/data/api/organization-product-api";
import { CommerceStoreCatalogSourceApi } from "@/src/data/api/commerce-store-catalog-source-api";
import type {
  BenefitCommerceApplicability,
  CommerceProductMapping,
} from "@/src/data/api/benefit-commerce-api";

type Props = {
  organizationId: string;
  benefit: Benefit;
  rules: BenefitUsageRule[];
  products?: unknown[];
  mappings?: CommerceProductMapping[];
  applicability?: BenefitCommerceApplicability | null;
  categoryName: string;
  typeName: string;
  statusName: string;
  formatRule: (rule: BenefitUsageRule) => string;
};

type StoreContext = {
  store: Store;
  integrationId: string | null;
  catalogId: string | null;
  catalogName: string | null;
  error?: string;
};

type ViewData = {
  products: OrganizationProduct[];
  catalogs: OrganizationProductCatalog[];
  mappings: OrganizationCommerceProductMapping[];
  snapshots: CommerceProductMapping[];
  stores: StoreContext[];
};

type PriceResult =
  | { kind: "available"; currency: string; minor: number; lastSynced?: string }
  | { kind: "unavailable"; reason: string };

const catalogSourceApi = new CommerceStoreCatalogSourceApi();

const money = (currency: string, minor: number) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 150, flexGrow: 1, flexBasis: "42%", gap: 3 }}>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text">
        {value || "—"}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
        paddingTop: 16,
        gap: 12,
      }}
    >
      <Text variant="bodyStrong" color="text">
        {title}
      </Text>
      {children}
    </View>
  );
}

function adjustedPrice(
  original: number,
  currency: string,
  adjustment?: BenefitCommerceApplicability | null,
): number | null {
  if (!adjustment?.active) return null;

  if (
    adjustment.currencyCode &&
    adjustment.currencyCode.toUpperCase() !== currency.toUpperCase()
  ) {
    return null;
  }

  switch (adjustment.adjustmentType) {
    case "PRODUCT_FREE":
      return 0;

    case "PRODUCT_PERCENT_OFF": {
      const percentage = adjustment.percentage;
      if (percentage == null || percentage <= 0 || percentage > 100) {
        return null;
      }
      return Math.max(
        0,
        original -
          Math.min(original, Math.round((original * percentage) / 100)),
      );
    }

    case "PRODUCT_FIXED_OFF": {
      const amount = adjustment.amountMinor;
      if (amount == null || amount < 0) return null;
      return Math.max(0, original - Math.min(original, amount));
    }

    default:
      return null;
  }
}

function resolvePrice(
  productId: string,
  context: StoreContext,
  data: ViewData,
): PriceResult {
  if (context.error) {
    return { kind: "unavailable", reason: context.error };
  }

  if (!context.integrationId || !context.catalogId) {
    return { kind: "unavailable", reason: "No selected product catalog" };
  }

  const product = data.products.find((p) => p.productId === productId);
  if (!product) {
    return { kind: "unavailable", reason: "Memgine product not found" };
  }

  // Resolve the canonical catalog from the actual W41-selected
  // external catalog identity, never from its display name.
  const matchingCatalogs = data.catalogs.filter(
    (catalog) =>
      catalog.integrationConfigurationId === context.integrationId &&
      catalog.externalCatalogId === context.catalogId &&
      catalog.active,
  );

  if (matchingCatalogs.length !== 1) {
    return {
      kind: "unavailable",
      reason: "Selected catalog is not uniquely linked to Memgine",
    };
  }

  if (product.productCatalogId !== matchingCatalogs[0].productCatalogId) {
    return {
      kind: "unavailable",
      reason: "Product is not linked to this Store's selected catalog",
    };
  }

  const eligibleMappings = data.mappings.filter(
    (mapping) =>
      mapping.active &&
      mapping.productId === productId &&
      mapping.integrationConfigurationId === context.integrationId &&
      (mapping.storeId === context.store.id || !mapping.storeId),
  );

  // A Store-specific mapping takes precedence over an organization mapping.
  const storeMappings = eligibleMappings.filter(
    (mapping) => mapping.storeId === context.store.id,
  );

  const effectiveMappings = storeMappings.length
    ? storeMappings
    : eligibleMappings.filter((mapping) => !mapping.storeId);

  if (effectiveMappings.length === 0) {
    return { kind: "unavailable", reason: "No applicable Poynt mapping" };
  }

  if (effectiveMappings.length !== 1) {
    return {
      kind: "unavailable",
      reason: "Multiple conflicting mappings for this Store",
    };
  }

  const mapping = effectiveMappings[0];

  // Price snapshots have their own identity. Resolve through
  // the mapping ID, not by product name or SKU.
  const snapshotMappings = data.snapshots.filter(
    (candidate) =>
      candidate.active &&
      candidate.mappingId === mapping.mappingId &&
      candidate.productId === productId &&
      candidate.integrationConfigurationId === context.integrationId,
  );

  if (snapshotMappings.length !== 1 || !snapshotMappings[0].snapshot) {
    return {
      kind: "unavailable",
      reason: "Mapped product price snapshot unavailable",
    };
  }

  const snapshot = snapshotMappings[0].snapshot;

  if (
    !Number.isSafeInteger(snapshot.unitPriceMinorSnapshot) ||
    snapshot.unitPriceMinorSnapshot < 0 ||
    !snapshot.currencyCode
  ) {
    return { kind: "unavailable", reason: "Invalid price snapshot" };
  }

  return {
    kind: "available",
    currency: snapshot.currencyCode,
    minor: snapshot.unitPriceMinorSnapshot,
    lastSynced: snapshot.lastSyncedAt,
  };
}

export function BenefitReadOnlyDetails({
  organizationId,
  benefit,
  rules,
  mappings,
  applicability,
  categoryName,
  typeName,
  statusName,
  formatRule,
}: Props) {
  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setData(null);
    setError(null);

    const load = async () => {
      const [productsResult, catalogsResult, mappingsResult, storesResult] =
        await Promise.all([
          organizationProductApi.products(organizationId),
          organizationProductApi.catalogs(organizationId),
          organizationProductApi.mappings(organizationId),
          apis.store.list(organizationId),
        ]);

      if (!productsResult.success) {
        throw new Error(productsResult.error.message);
      }
      if (!catalogsResult.success) {
        throw new Error(catalogsResult.error.message);
      }
      if (!mappingsResult.success) {
        throw new Error(mappingsResult.error.message);
      }
      if (!storesResult.success) {
        throw new Error(storesResult.error.message);
      }

      const stores = storesResult.data.filter((store) => !store.isDeleted);

      const contexts = await Promise.all(
        stores.map(async (store): Promise<StoreContext> => {
          try {
            const result = await catalogSourceApi.get(organizationId, store.id);

            if (!result.success) {
              return {
                store,
                integrationId: null,
                catalogId: null,
                catalogName: null,
                error: result.error.message,
              };
            }

            return {
              store,
              integrationId:
                result.data.source?.integrationConfigurationId ?? null,
              catalogId: result.data.source?.catalogId ?? null,
              catalogName: result.data.source?.catalogName ?? null,
            };
          } catch {
            return {
              store,
              integrationId: null,
              catalogId: null,
              catalogName: null,
              error: "Unable to load catalog selection",
            };
          }
        }),
      );

      if (active) {
        setData({
          products: productsResult.data,
          catalogs: catalogsResult.data,
          mappings: mappingsResult.data,
          snapshots: mappings ?? [],
          stores: contexts,
        });
      }
    };

    void load()
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load products",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId, mappings]);

  const productIds = useMemo(
    () =>
      Array.from(
        new Set(
          benefit.productIds?.length
            ? benefit.productIds
            : benefit.productId
              ? [benefit.productId]
              : [],
        ),
      ),
    [benefit.productIds, benefit.productId],
  );

  const productById = useMemo(
    () =>
      new Map(
        (data?.products ?? []).map((product) => [product.productId, product]),
      ),
    [data],
  );

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 5 }}>
        <Text variant="bodyStrong" color="text">
          {benefit.displayName || benefit.benefitName}
        </Text>
        <Text variant="bodySmall" color="textMuted">
          {benefit.benefitCode} · {statusName}
        </Text>
      </View>

      <Section title="Benefit details">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          <Field label="Category" value={categoryName} />
          <Field label="Benefit type" value={typeName} />
          <Field label="Effective date" value={benefit.effectiveDate ?? "—"} />
          <Field
            label="Expiry date"
            value={benefit.expiryDate ?? "No expiry"}
          />
        </View>
        <Field label="Description" value={benefit.description ?? "—"} />
      </Section>

      <Section title="Store availability">
        {benefit.storeAvailability?.mode === "SELECTED_STORES" ? (
          <>
            <Text variant="body" color="text">
              Selected Stores
            </Text>
            <Text variant="bodySmall" color="textMuted">
              {(benefit.storeAvailability.storeIds ?? [])
                .map(
                  (storeId) =>
                    data?.stores.find((context) => context.store.id === storeId)
                      ?.store.name ?? "Store unavailable",
                )
                .join(", ") || "No Stores selected"}
            </Text>
          </>
        ) : benefit.storeAvailability?.mode === "ALL_STORES" ? (
          <Text variant="body" color="text">
            All active Stores
          </Text>
        ) : (
          <Text variant="bodySmall" color="textMuted">
            Store availability is not configured for this legacy Benefit.
          </Text>
        )}
      </Section>

      <Section title="Eligible products">
        <Text variant="bodySmall" color="textMuted">
          Indicative prices by Store, based on the currently selected Product
          Catalog configuration. These estimates do not determine eligibility.
        </Text>

        {loading ? (
          <Text variant="body" color="textMuted">
            Loading product prices…
          </Text>
        ) : error ? (
          <Text variant="body" color="text">
            Product information unavailable: {error}
          </Text>
        ) : productIds.length === 0 ? (
          <Text variant="body" color="textMuted">
            No Memgine products associated with this benefit.
          </Text>
        ) : (
          productIds.map((productId) => {
            const product = productById.get(productId);

            return (
              <View
                key={productId}
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 10,
                  padding: 14,
                  gap: 12,
                }}
              >
                <View style={{ gap: 3 }}>
                  <Text variant="bodyStrong" color="text">
                    {product?.productName ?? "Memgine product not found"}
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    {product?.productCode ?? productId}
                  </Text>
                </View>

                {data?.stores.length ? (
                  data.stores.map((context) => {
                    const price = resolvePrice(productId, context, data);
                    const estimate =
                      price.kind === "available"
                        ? adjustedPrice(
                            price.minor,
                            price.currency,
                            applicability,
                          )
                        : null;

                    return (
                      <View
                        key={context.store.id}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: "#F1F5F9",
                          paddingTop: 10,
                          gap: 7,
                        }}
                      >
                        <Text variant="bodyStrong" color="text">
                          {context.store.name}
                        </Text>

                        <Text variant="bodySmall" color="textMuted">
                          {context.catalogName ??
                            (context.catalogId
                              ? `Catalog ${context.catalogId}`
                              : "No selected catalog")}
                        </Text>

                        {price.kind === "available" ? (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 12,
                            }}
                          >
                            <Field
                              label="Original price"
                              value={money(price.currency, price.minor)}
                            />
                            <Field
                              label="Estimated benefit price"
                              value={
                                estimate === null
                                  ? "Not available"
                                  : money(price.currency, estimate)
                              }
                            />
                          </View>
                        ) : (
                          <Text variant="bodySmall" color="textMuted">
                            {price.reason}
                          </Text>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <Text variant="bodySmall" color="textMuted">
                    No configured Stores available.
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Section>

      <Section title="Redemption rules">
        {rules.length ? (
          rules.map((rule) => (
            <View
              key={rule.id}
              style={{
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 8,
                padding: 12,
                gap: 5,
              }}
            >
              <Text variant="bodyStrong" color="text">
                {rule.ruleName}
              </Text>
              <Text variant="bodySmall" color="textMuted">
                {formatRule(rule)}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="bodySmall" color="textMuted">
            No redemption rules configured.
          </Text>
        )}
      </Section>

      <Text variant="bodySmall" color="textMuted">
        Prices are informational snapshots. Actual redemption and checkout
        prices may differ. This screen does not change benefit configuration.
      </Text>
    </View>
  );
}
