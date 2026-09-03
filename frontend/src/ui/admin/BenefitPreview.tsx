import { StyleSheet, View } from "react-native";

import type { Benefit, Product, ReferenceDataItem, Status } from "@/src/core";

import { Card, Section, Text } from "@/src/ui";

import { useTheme } from "@/src/providers";

type Props = {
  currentBenefits: Benefit[];
  proposedBenefits: Benefit[];

  products: Product[];

  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  benefitStatuses: Status[];
};

const value = (input?: string) => input?.trim() || "—";

const categoryName = (id: string, items: ReferenceDataItem[]) =>
  items.find((item) => item.id === id)?.name ?? value(id);

const typeName = (id: string, items: ReferenceDataItem[]) =>
  items.find((item) => item.id === id)?.name ?? value(id);

const statusName = (id: string, items: Status[]) =>
  items.find((item) => item.id === id)?.statusName ?? value(id);

const productName = (id: string | undefined, products: Product[]) => {
  if (!id) {
    return "—";
  }

  const product = products.find((item) => item.id === id);

  return product ? `${product.productName} (${product.productCode})` : "—";
};

const money = (amount?: Benefit["retailPrice"]) =>
  amount ? `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}` : "—";

function CustomerList({
  title,
  benefits,
  categories,
  types,
  statuses,
  products,
}: {
  title: string;
  benefits: Benefit[];
  categories: ReferenceDataItem[];
  types: ReferenceDataItem[];
  statuses: Status[];
  products: Product[];
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.panel,
        {
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.panelHeader}>
        <Text variant="h3" color="text">
          {title}
        </Text>

        <Text variant="caption" color="textMuted">
          Customer Membership → Benefits
        </Text>
      </View>

      {benefits.length === 0 ? (
        <View
          style={[
            styles.empty,
            {
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <Text variant="body" color="textMuted">
            No benefits are currently configured.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {benefits.map((benefit) => (
            <View
              key={benefit.id}
              style={[
                styles.benefit,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text variant="title" color="text">
                {benefit.displayName || benefit.benefitName}
              </Text>

              {benefit.description ? (
                <Text variant="bodySmall" color="textSecondary">
                  {benefit.description}
                </Text>
              ) : null}

              <View style={styles.detailBlock}>
                <Text variant="caption" color="textMuted">
                  Product
                </Text>

                <Text variant="bodySmall" color="text">
                  {productName(benefit.productId, products)}
                </Text>
              </View>

              <Text variant="caption" color="textMuted">
                {categoryName(benefit.benefitCategoryId, categories)} ·{" "}
                {typeName(benefit.benefitTypeId, types)} ·{" "}
                {statusName(benefit.benefitStatusId, statuses)}
              </Text>

              {benefit.retailPrice ? (
                <Text variant="caption" color="textMuted">
                  {money(benefit.retailPrice)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function BenefitPreview({
  currentBenefits,
  proposedBenefits,
  products,
  benefitCategories,
  benefitTypes,
  benefitStatuses,
}: Props) {
  const current = currentBenefits.filter((item) => !item.isDeleted);

  const proposed = proposedBenefits.filter((item) => !item.isDeleted);

  const currentById = new Map(current.map((item) => [item.id, item]));

  const proposedById = new Map(proposed.map((item) => [item.id, item]));

  const changes: string[] = [];

  for (const item of proposed) {
    if (!currentById.has(item.id)) {
      changes.push(`Added: ${item.displayName || item.benefitName}`);
    }
  }

  for (const item of current) {
    if (!proposedById.has(item.id)) {
      changes.push(`Removed: ${item.displayName || item.benefitName}`);
    }
  }

  for (const item of proposed) {
    const old = currentById.get(item.id);

    if (old && JSON.stringify(old) !== JSON.stringify(item)) {
      changes.push(`Updated: ${item.displayName || item.benefitName}`);
    }
  }

  return (
    <Card padding="lg" elevation="sm">
      <Section
        title="Customer Preview"
        description="Compare what customers see today with the proposed Benefit changes."
      >
        <View style={styles.columns}>
          <CustomerList
            title="CURRENT"
            benefits={current}
            categories={benefitCategories}
            types={benefitTypes}
            statuses={benefitStatuses}
            products={products}
          />

          <CustomerList
            title="PROPOSED"
            benefits={proposed}
            categories={benefitCategories}
            types={benefitTypes}
            statuses={benefitStatuses}
            products={products}
          />
        </View>

        <View style={styles.changes}>
          <Text variant="title" color="text">
            Changes
          </Text>

          {changes.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No changes.
            </Text>
          ) : (
            changes.map((change) => (
              <Text key={change} variant="bodySmall" color="text">
                • {change}
              </Text>
            ))
          )}
        </View>
      </Section>
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 16,
  },

  panel: {
    flex: 1,
    minWidth: 340,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 16,
  },

  panelHeader: {
    gap: 3,
  },

  list: {
    gap: 12,
  },

  benefit: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 7,
  },

  detailBlock: {
    gap: 2,
    paddingTop: 2,
  },

  empty: {
    minHeight: 100,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  changes: {
    marginTop: 24,
    gap: 8,
  },
});
