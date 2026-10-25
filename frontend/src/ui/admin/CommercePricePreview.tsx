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

type CommercePricePreviewProps = {
  productIds: string[];
  productName: (productId: string) => string;
  mappings: CommercePricePreviewMapping[];
  adjustment: CommercePricePreviewAdjustment | null;
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

type UnavailablePreview = {
  kind: "unavailable";
  reason: string;
};

type Preview = AvailablePreview | UnavailablePreview;

const STALE_SNAPSHOT_MS = 24 * 60 * 60 * 1000;

function money(currencyCode: string, minor: number) {
  return `${currencyCode} ${(minor / 100).toFixed(2)}`;
}

function lastSyncedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function snapshotIsStale(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || Date.now() - timestamp > STALE_SNAPSHOT_MS;
}

function previewFor(
  productId: string,
  mappings: CommercePricePreviewMapping[],
  adjustment: CommercePricePreviewAdjustment | null,
): Preview {
  const candidates = mappings.filter(
    (mapping) => mapping.productId === productId && mapping.snapshot,
  );
  if (candidates.length === 0) {
    return { kind: "unavailable", reason: "No catalog price is available for this product." };
  }

  const contexts = new Map<string, CommercePricePreviewMapping[]>();
  for (const mapping of candidates) {
    const key = `${mapping.integrationConfigurationId}:${mapping.storeId ?? "organization"}`;
    contexts.set(key, [...(contexts.get(key) ?? []), mapping]);
  }
  if (contexts.size !== 1) {
    return {
      kind: "unavailable",
      reason: "Price unavailable because this product has prices from more than one POS integration or store.",
    };
  }

  const contextMappings = [...contexts.values()][0];
  const externalProducts = new Set(contextMappings.map((mapping) => mapping.externalProductId));
  if (externalProducts.size !== 1) {
    return {
      kind: "unavailable",
      reason: "Price unavailable because this product has more than one external product mapping in the configured catalog.",
    };
  }

  const snapshot = contextMappings[0].snapshot!;
  if (adjustment?.currencyCode && adjustment.currencyCode !== snapshot.currencyCode) {
    return {
      kind: "unavailable",
      reason: "Price unavailable because the adjustment currency does not match the configured catalog price.",
    };
  }

  const originalMinor = snapshot.unitPriceMinorSnapshot;
  const amountMinor = adjustment?.amountMinor ?? 0;
  const discountMinor =
    adjustment?.adjustmentType === "PRODUCT_FREE"
      ? originalMinor
      : adjustment?.adjustmentType === "PRODUCT_PERCENT_OFF"
        ? Math.min(originalMinor, Math.round((originalMinor * (adjustment.percentage ?? 0)) / 100))
        : adjustment?.adjustmentType === "PRODUCT_SPECIAL_PRICE"
          ? Math.max(0, originalMinor - Math.min(originalMinor, amountMinor))
          : Math.min(originalMinor, amountMinor);

  return {
    kind: "available",
    snapshot,
    originalMinor,
    discountMinor,
    estimatedMinor: originalMinor - discountMinor,
    catalogSource: contextMappings[0].storeId
      ? "Configured store catalog"
      : "Organization catalog",
    stale: snapshotIsStale(snapshot.lastSyncedAt),
  };
}

/**
 * Shows a single, conservative catalog estimate for each selected canonical
 * product. It never combines snapshots from different commerce contexts.
 */
export function CommercePricePreview({
  productIds,
  productName,
  mappings,
  adjustment,
}: CommercePricePreviewProps) {
  const selectedProductIds = [...new Set(productIds)];
  if (selectedProductIds.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" color="textMuted">
        Catalog price estimates
      </Text>
      {selectedProductIds.map((productId) => {
        const preview = previewFor(productId, mappings, adjustment);
        return (
          <Card key={productId} padding="md" style={styles.card}>
            <Text variant="body" color="text">
              {productName(productId)}
            </Text>
            {preview.kind === "available" ? (
              <View style={styles.details}>
                <View style={styles.row}>
                  <Text variant="bodySmall" color="textMuted">Original price</Text>
                  <Text variant="bodySmall" color="text">
                    {money(preview.snapshot.currencyCode, preview.originalMinor)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text variant="bodySmall" color="textMuted">Discount</Text>
                  <Text variant="bodySmall" color="text">
                    {money(preview.snapshot.currencyCode, preview.discountMinor)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text variant="bodySmall" color="textMuted">Estimated price</Text>
                  <Text variant="bodySmall" color="text">
                    {money(preview.snapshot.currencyCode, preview.estimatedMinor)}
                  </Text>
                </View>
                <Text variant="bodySmall" color="textMuted">
                  Catalog source: {preview.catalogSource} · Last synced {lastSyncedLabel(preview.snapshot.lastSyncedAt)}
                  {preview.stale ? " · Catalog snapshot may be stale" : ""}
                </Text>
              </View>
            ) : (
              <Text variant="bodySmall" color="textMuted">{preview.reason}</Text>
            )}
            <Text variant="bodySmall" color="textMuted">
              Final checkout price may differ.
            </Text>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 8 },
  card: { gap: 8 },
  details: { gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
