import { StyleSheet, View } from "react-native";

import type { Benefit, MembershipProduct, Status } from "@/src/core";

import { Card, Section, Text } from "@/src/ui";
import { useTheme } from "@/src/providers";

type MembershipPreviewProps = {
  organizationName: string;
  currentProduct?: MembershipProduct | null;
  proposedProduct: MembershipProduct;
  benefits: Benefit[];
  productStatuses: Status[];
  subscriptionPlanStatuses: Status[];
};

const value = (input?: string | null) => input?.trim() || "—";

const statusName = (id: string, statuses: Status[]) =>
  statuses.find((status) => status.id === id)?.statusName ?? value(id);

function MembershipCardPreview({
  organizationName,
  product,
  productStatuses,
}: {
  organizationName: string;
  product: MembershipProduct;
  productStatuses: Status[];
}) {
  const theme = useTheme();

  const membershipName = product.displayName || product.membershipProductName;

  const status = statusName(product.productStatusId, productStatuses);

  const initial = membershipName.trim().charAt(0).toUpperCase() || "M";

  return (
    <View
      style={[
        styles.membershipCard,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <View
        style={[
          styles.accentBar,
          {
            backgroundColor: theme.colors.primary,
          },
        ]}
      />

      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <View
            style={[
              styles.monogram,
              {
                backgroundColor: theme.colors.primarySoft,
              },
            ]}
          >
            <Text variant="h3" color="primary">
              {initial}
            </Text>
          </View>

          <View style={styles.cardTitleBlock}>
            <Text variant="caption" color="textMuted">
              {organizationName}
            </Text>

            <Text variant="h3" color="text">
              {membershipName || "Membership"}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View>
            <Text variant="caption" color="textMuted">
              Status
            </Text>

            <Text variant="bodySmall" color="text">
              {status}
            </Text>
          </View>

          <View style={styles.codeBlock}>
            <Text variant="caption" color="textMuted">
              Product Code
            </Text>

            <Text variant="bodySmall" color="text">
              {value(product.membershipProductCode)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ProductPanel({
  title,
  organizationName,
  product,
  benefits,
  productStatuses,
  subscriptionPlanStatuses,
}: {
  title: string;
  organizationName: string;
  product?: MembershipProduct | null;
  benefits: Benefit[];
  productStatuses: Status[];
  subscriptionPlanStatuses: Status[];
}) {
  const theme = useTheme();

  if (!product) {
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
            Customer Membership
          </Text>
        </View>

        <View
          style={[
            styles.empty,
            {
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <Text variant="body" color="textMuted">
            No membership exists yet.
          </Text>
        </View>
      </View>
    );
  }

  const productBenefits = benefits.filter(
    (benefit) => !benefit.isDeleted && product.benefitIds.includes(benefit.id),
  );

  const activePlans = product.plans.filter((plan) => !plan.isDeleted);

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
          Customer Membership
        </Text>
      </View>

      <MembershipCardPreview
        organizationName={organizationName}
        product={product}
        productStatuses={productStatuses}
      />

      {product.description ? (
        <Text variant="bodySmall" color="textSecondary">
          {product.description}
        </Text>
      ) : null}

      <View style={styles.sectionBlock}>
        <Text variant="title" color="text">
          Benefits
        </Text>

        {productBenefits.length === 0 ? (
          <View
            style={[
              styles.emptySmall,
              {
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="bodySmall" color="textMuted">
              No benefits configured.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {productBenefits.map((benefit) => (
              <View
                key={benefit.id}
                style={[
                  styles.listItem,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  {benefit.displayName || benefit.benefitName}
                </Text>

                {benefit.description ? (
                  <Text variant="bodySmall" color="textSecondary">
                    {benefit.description}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.sectionBlock}>
        <Text variant="title" color="text">
          Plans & Pricing
        </Text>

        {activePlans.length === 0 ? (
          <View
            style={[
              styles.emptySmall,
              {
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="bodySmall" color="textMuted">
              No subscription plans configured.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {activePlans.map((plan) => (
              <View
                key={plan.id}
                style={[
                  styles.plan,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <View style={styles.planHeader}>
                  <Text variant="body" color="text">
                    {value(plan.subscriptionPlanName)}
                  </Text>

                  <Text variant="body" color="text">
                    {plan.price.currency}{" "}
                    {(plan.price.amountMinor / 100).toFixed(2)}
                  </Text>
                </View>

                <Text variant="caption" color="textMuted">
                  Every {plan.subscriptionPeriod}{" "}
                  {plan.subscriptionPeriodUnit.toLowerCase()}
                </Text>

                <Text variant="caption" color="textMuted">
                  {statusName(
                    plan.subscriptionPlanStatusId,
                    subscriptionPlanStatuses,
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function MembershipPreview({
  organizationName,
  currentProduct,
  proposedProduct,
  benefits,
  productStatuses,
  subscriptionPlanStatuses,
}: MembershipPreviewProps) {
  const current = currentProduct ?? null;
  const proposed = proposedProduct;

  const changes: string[] = [];

  if (!current) {
    changes.push(
      `Added: ${proposed.displayName || proposed.membershipProductName}`,
    );
  } else {
    if (current.membershipProductName !== proposed.membershipProductName) {
      changes.push(
        `Updated: Membership name → ${
          proposed.displayName || proposed.membershipProductName
        }`,
      );
    }

    if (current.displayName !== proposed.displayName) {
      changes.push("Updated: Display name");
    }

    if (current.description !== proposed.description) {
      changes.push("Updated: Description");
    }

    if (current.productCategoryId !== proposed.productCategoryId) {
      changes.push("Updated: Category");
    }

    if (current.productTypeId !== proposed.productTypeId) {
      changes.push("Updated: Type");
    }

    if (current.productStatusId !== proposed.productStatusId) {
      changes.push("Updated: Membership status");
    }

    const currentBenefitIds = [...current.benefitIds].sort();
    const proposedBenefitIds = [...proposed.benefitIds].sort();

    if (
      JSON.stringify(currentBenefitIds) !== JSON.stringify(proposedBenefitIds)
    ) {
      changes.push("Updated: Benefits");
    }

    const currentPlans = current.plans.filter((plan) => !plan.isDeleted);

    const proposedPlans = proposed.plans.filter((plan) => !plan.isDeleted);

    if (JSON.stringify(currentPlans) !== JSON.stringify(proposedPlans)) {
      changes.push("Updated: Subscription plans / pricing");
    }
  }

  return (
    <Card padding="lg" elevation="sm">
      <Section
        title="Customer Preview"
        description="Compare what customers see today with the proposed Membership changes."
      >
        <View style={styles.columns}>
          <ProductPanel
            title="CURRENT"
            organizationName={organizationName}
            product={current}
            benefits={benefits}
            productStatuses={productStatuses}
            subscriptionPlanStatuses={subscriptionPlanStatuses}
          />

          <ProductPanel
            title="PROPOSED"
            organizationName={organizationName}
            product={proposed}
            benefits={benefits}
            productStatuses={productStatuses}
            subscriptionPlanStatuses={subscriptionPlanStatuses}
          />
        </View>

        <View
          style={[
            styles.changes,
            {
              borderColor: useTheme().colors.border,
            },
          ]}
        >
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

  membershipCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },

  accentBar: {
    height: 7,
  },

  cardContent: {
    padding: 18,
    gap: 20,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  monogram: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  cardTitleBlock: {
    flex: 1,
    gap: 3,
  },

  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },

  codeBlock: {
    alignItems: "flex-end",
  },

  sectionBlock: {
    gap: 10,
  },

  list: {
    gap: 10,
  },

  listItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },

  plan: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },

  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  empty: {
    minHeight: 180,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  emptySmall: {
    minHeight: 70,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  changes: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
});
