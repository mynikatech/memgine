import { View } from "react-native";

import type {
  Benefit,
  BenefitUsageRule,
  MembershipProduct,
  Store,
  SubscriptionPlan,
} from "@/src/core";

import {
  compactPotentialSavingsLabel,
  formatTransactionMoney,
} from "@/src/core/domain/savings-display";

import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import { useTheme } from "@/src/providers";
import { Modal } from "@/src/ui/Modal";
import { Text } from "@/src/ui/Text";
import { formatUsage, formatAvailability } from "./BenefitItem";

type Props = {
  visible: boolean;
  onClose: () => void;
  organizationName: string;
  membership: MembershipProduct;
  plan: SubscriptionPlan;
  benefits: Benefit[];
  usageRules?: BenefitUsageRule[];
  stores: Store[];
};

export function MembershipPlanDetailsModal({
  visible,
  onClose,
  organizationName,
  membership,
  plan,
  benefits,
  usageRules = [],
  stores,
}: Props) {
  const theme = useTheme();

  const membershipName =
    membership.displayName ?? membership.membershipProductName;

  const price =
    formatTransactionMoney(plan.price.amountMinor, plan.price.currency) ??
    "Price unavailable";

  const duration = getSubscriptionPeriodLabel(plan);

  const potentialSavings = compactPotentialSavingsLabel(plan.potentialSavings);

  const includedBenefits = benefits.filter((benefit) =>
    membership.benefitIds.includes(benefit.id),
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Membership Details"
      scrollable
      maxWidth={480}
      testID="experience-membership-details-modal"
    >
      <View style={{ gap: theme.spacing.lg }}>
        {/* Membership identity */}
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textMuted">
            {organizationName}
          </Text>

          <Text variant="title">
            {membershipName} · {plan.subscriptionPlanName}
          </Text>

          {plan.description || membership.description ? (
            <Text variant="bodySmall" color="textSecondary">
              {plan.description || membership.description}
            </Text>
          ) : null}
        </View>

        {/* Price and validity */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.xl,
          }}
        >
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="textMuted">
              Membership Price
            </Text>
            <Text variant="bodyStrong">{price}</Text>
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="textMuted">
              Validity
            </Text>
            <Text variant="bodyStrong">{duration}</Text>
          </View>
        </View>

        {/* Benefits only — no offers */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="bodyStrong">Included Benefits</Text>

          {includedBenefits.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No included benefits are listed for this membership.
            </Text>
          ) : (
            includedBenefits.map((benefit, index) => {
              const rules = usageRules.filter(
                (rule) => rule.benefitId === benefit.id && !rule.isDeleted,
              );

              const availability = benefit.storeAvailability;

              const participatingStores = availability
                ? stores
                    .filter(
                      (store) =>
                        availability.mode === "ALL_STORES" ||
                        availability.storeIds.includes(store.id),
                    )
                    .map((store) => store.name)
                : [];

              return (
                <View
                  key={benefit.id}
                  style={{
                    gap: theme.spacing.xs,
                    paddingTop: index === 0 ? 0 : theme.spacing.sm,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  <Text variant="bodyStrong">
                    {benefit.displayName ?? benefit.benefitName}
                  </Text>

                  {benefit.description ? (
                    <Text variant="bodySmall" color="textSecondary">
                      {benefit.description}
                    </Text>
                  ) : null}

                  {rules.map((rule, ruleIndex) => (
                    <View key={ruleIndex} style={{ gap: theme.spacing.xs }}>
                      <Text variant="bodySmall" color="primary">
                        {formatUsage(rule)}
                      </Text>

                      {formatAvailability(rule) ? (
                        <Text variant="caption" color="textMuted">
                          {formatAvailability(rule)}
                        </Text>
                      ) : null}
                    </View>
                  ))}

                  {participatingStores.length > 0 ? (
                    <Text variant="caption" color="textMuted">
                      Participating stores: {participatingStores.join(", ")}
                    </Text>
                  ) : null}

                  {benefit.disclaimerText?.trim() ? (
                    <Text variant="caption" color="textMuted">
                      {benefit.disclaimerText.trim()}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Published potential savings */}
        {potentialSavings ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              gap: theme.spacing.xs,
            }}
          >
            <Text variant="bodyStrong">Potential Savings</Text>

            <Text variant="bodyStrong" color="primary">
              {potentialSavings.replace(/^Potential savings:\s*/i, "")}
            </Text>

            <Text variant="caption" color="textMuted">
              Your savings may vary depending on how often you use your
              benefits.
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
