import { StyleSheet, View } from "react-native";

import { Card } from "../Card";
import { Text } from "../Text";

type CatalogSnapshot = {
  productName: string;
  currencyCode: string;
  unitPriceMinorSnapshot: number;
  lastSyncedAt: string;
};

export type CommercePricePreviewMapping = {
  productId?: string | null;
  integrationConfigurationId: string;
  storeId?: string | null;
  externalCatalogId?: string | null;
  externalProductId: string;
  snapshot?: CatalogSnapshot | null;
};

export type CommercePricePreviewAdjustment = {
  adjustmentType:
    | "PRODUCT_FREE"
    | "PRODUCT_PERCENT_OFF"
    | "PRODUCT_FIXED_OFF"
    | "PRODUCT_SPECIAL_PRICE";
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
};

export type CommercePricePreviewStoreContext = {
  storeId: string;
  storeName: string;
  integrationConfigurationId?: string;
  externalCatalogId?: string;
  catalogSourceName?: string;
};

type CommercePricePreviewProps = {
  productIds: string[];
  productName: (productId: string) => string;
  mappings: CommercePricePreviewMapping[];
  adjustment: CommercePricePreviewAdjustment | null;
  /** Original single-Store contract remains supported. */
  storeId?: string;
  integrationConfigurationId?: string;
  catalogSourceName?: string;
  /** Explicit active Store/catalog contexts for a multi-Store Benefit. */
  storeContexts?: CommercePricePreviewStoreContext[];
  /** Show an explicit unavailable section for every requested Store context. */
  showUnavailableStores?: boolean;
};

type AvailablePreview = {
  kind: "available";
  snapshot: CatalogSnapshot;
  originalMinor: number;
  discountMinor: number;
  estimatedMinor: number;
  catalogSource: string;
  stale: boolean;
};

type Preview = AvailablePreview | { kind: "unavailable"; reason: string };
const STALE_SNAPSHOT_MS = 24 * 60 * 60 * 1000;

function money(currencyCode: string, minor: number): string {
  return `${currencyCode} ${(minor / 100).toFixed(2)}`;
}

function lastSyncedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function snapshotIsStale(value: string): boolean {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || Date.now() - timestamp > STALE_SNAPSHOT_MS;
}

/** Price resolution is limited to one Store and one selected integration. */
function previewFor(
  productId: string,
  mappings: CommercePricePreviewMapping[],
  adjustment: CommercePricePreviewAdjustment | null,
  context: {
    storeId?: string;
    integrationConfigurationId?: string;
    externalCatalogId?: string;
    catalogSourceName?: string;
  },
): Preview {
  if (context.storeId && !context.integrationConfigurationId) {
    return {
      kind: "unavailable",
      reason: "This Store has no selected POS catalog.",
    };
  }

  // Never substitute an organization-wide/other-Store snapshot when
  // estimating a specific Store's price. Historical unqualified mappings
  // can still be used by callers using the original no-Store contract.
  const candidates = mappings.filter(
    (mapping) =>
      mapping.productId === productId &&
      (!context.integrationConfigurationId ||
        mapping.integrationConfigurationId ===
          context.integrationConfigurationId) &&
      (!context.externalCatalogId ||
        mapping.externalCatalogId === context.externalCatalogId) &&
      (!context.storeId || mapping.storeId === context.storeId),
  );

  if (candidates.length === 0) {
    return {
      kind: "unavailable",
      reason: "No active POS mapping is available for this Store.",
    };
  }

  // In a legacy caller without Store context, do not pick an arbitrary
  // integration/Store price from multiple mappings.
  const contexts = new Set(
    candidates.map(
      (m) => `${m.integrationConfigurationId}:${m.storeId ?? "organization"}`,
    ),
  );
  if (contexts.size !== 1) {
    return {
      kind: "unavailable",
      reason:
        "Multiple POS Stores or integrations are mapped. Select a Store to see its price.",
    };
  }

  const externalProducts = new Set(candidates.map((m) => m.externalProductId));
  if (externalProducts.size !== 1) {
    return {
      kind: "unavailable",
      reason:
        "More than one external Product is mapped in this Store. Verify the mapping.",
    };
  }

  const withPrice = candidates.filter((m) => m.snapshot != null);
  if (withPrice.length === 0) {
    return {
      kind: "unavailable",
      reason: "No synchronized catalog price is available for this Store.",
    };
  }
  // Inconsistent or missing snapshots must not silently choose a price.
  if (withPrice.length !== candidates.length) {
    return {
      kind: "unavailable",
      reason: "Some POS price snapshots are missing for this Store.",
    };
  }
  const snapshots = withPrice.map((m) => m.snapshot!);
  const distinctPrices = new Set(
    snapshots.map((s) => `${s.currencyCode}:${s.unitPriceMinorSnapshot}`),
  );
  if (distinctPrices.size !== 1) {
    return {
      kind: "unavailable",
      reason: "Conflicting POS prices exist for this Store.",
    };
  }

  const snapshot = snapshots[0];
  const originalMinor = snapshot.unitPriceMinorSnapshot;
  if (!Number.isFinite(originalMinor) || originalMinor < 0) {
    return {
      kind: "unavailable",
      reason: "The Store's POS catalog price is invalid.",
    };
  }
  if (
    adjustment?.currencyCode &&
    adjustment.currencyCode !== snapshot.currencyCode
  ) {
    return {
      kind: "unavailable",
      reason:
        "The adjustment currency differs from this Store's catalog currency.",
    };
  }

  const amountMinor = Math.max(0, adjustment?.amountMinor ?? 0);
  const discountMinor =
    adjustment?.adjustmentType === "PRODUCT_FREE"
      ? originalMinor
      : adjustment?.adjustmentType === "PRODUCT_PERCENT_OFF"
        ? Math.min(
            originalMinor,
            Math.max(
              0,
              Math.round((originalMinor * (adjustment.percentage ?? 0)) / 100),
            ),
          )
        : adjustment?.adjustmentType === "PRODUCT_SPECIAL_PRICE"
          ? Math.max(0, originalMinor - Math.min(originalMinor, amountMinor))
          : adjustment?.adjustmentType === "PRODUCT_FIXED_OFF"
            ? Math.min(originalMinor, amountMinor)
            : 0;

  return {
    kind: "available",
    snapshot,
    originalMinor,
    discountMinor,
    estimatedMinor: originalMinor - discountMinor,
    catalogSource:
      context.catalogSourceName ||
      (context.storeId ? "Configured Store catalog" : "Organization catalog"),
    stale: snapshotIsStale(snapshot.lastSyncedAt),
  };
}

/** Informational, read-only estimates. Never merges Store pricing. */
export function CommercePricePreview({
  productIds,
  productName,
  mappings,
  adjustment,
  storeId,
  integrationConfigurationId,
  catalogSourceName,
  storeContexts,
  showUnavailableStores = false,
}: CommercePricePreviewProps) {
  const selectedProductIds = [...new Set(productIds)];
  if (selectedProductIds.length === 0) return null;

  const contexts = storeContexts
    ? [...new Map(storeContexts.map((item) => [item.storeId, item])).values()]
    : [
        {
          storeId,
          storeName: "Selected Store",
          integrationConfigurationId,
          catalogSourceName,
        },
      ];

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" color="textMuted">
        Catalog price estimates by Store
      </Text>
      {selectedProductIds.map((productId) => (
        <Card key={productId} padding="md" style={styles.card}>
          <Text variant="body" color="text">
            {productName(productId)}
          </Text>
          {contexts.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No selected Store catalog is available for price estimation.
            </Text>
          ) : (
            contexts.map((context) => {
              // A Product can be valid for some selected Stores but not others.
              // Only mapped Stores get a preview section.
              const eligible = mappings.some(
                (mapping) =>
                  mapping.productId === productId &&
                  (!context.storeId || mapping.storeId === context.storeId) &&
                  (!context.integrationConfigurationId ||
                    mapping.integrationConfigurationId ===
                      context.integrationConfigurationId) &&
                  (!context.externalCatalogId ||
                    mapping.externalCatalogId === context.externalCatalogId),
              );
              if (!eligible && storeContexts && !showUnavailableStores) return null;
              const preview = previewFor(
                productId,
                mappings,
                adjustment,
                context,
              );
              return (
                <View
                  key={context.storeId ?? "default"}
                  style={styles.storeDetails}
                >
                  {storeContexts ? (
                    <Text variant="body" color="text">
                      {context.storeName}
                    </Text>
                  ) : null}
                  {preview.kind === "available" ? (
                    <View style={styles.details}>
                      <View style={styles.row}>
                        <Text variant="bodySmall" color="textMuted">
                          Original price
                        </Text>
                        <Text variant="bodySmall" color="text">
                          {money(
                            preview.snapshot.currencyCode,
                            preview.originalMinor,
                          )}
                        </Text>
                      </View>
                      <View style={styles.row}>
                        <Text variant="bodySmall" color="textMuted">
                          Discount
                        </Text>
                        <Text variant="bodySmall" color="text">
                          {money(
                            preview.snapshot.currencyCode,
                            preview.discountMinor,
                          )}
                        </Text>
                      </View>
                      <View style={styles.row}>
                        <Text variant="bodySmall" color="textMuted">
                          Estimated price
                        </Text>
                        <Text variant="bodySmall" color="text">
                          {money(
                            preview.snapshot.currencyCode,
                            preview.estimatedMinor,
                          )}
                        </Text>
                      </View>
                      <Text variant="bodySmall" color="textMuted">
                        Catalog source: {preview.catalogSource} · Last synced{" "}
                        {lastSyncedLabel(preview.snapshot.lastSyncedAt)}
                        {preview.stale
                          ? " · Catalog snapshot may be stale"
                          : ""}
                      </Text>
                    </View>
                  ) : (
                    <Text variant="bodySmall" color="textMuted">
                      {preview.reason}
                    </Text>
                  )}
                </View>
              );
            })
          )}
          <Text variant="bodySmall" color="textMuted">
            Final checkout price may differ.
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 8 },
  card: { gap: 8 },
  storeDetails: { gap: 4, paddingTop: 8 },
  details: { gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
