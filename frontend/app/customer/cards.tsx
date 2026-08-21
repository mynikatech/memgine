import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import type {
  Benefit,
  CardStyle,
  MembershipProduct,
  OrganizationUser,
  Subscription,
} from "@/src/core";

import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import {
  BusinessThemeScope,
  useBusiness,
  useCustomerContext,
  useTranslation,
} from "@/src/providers";
import { buildTheme, Theme } from "@/src/theme/theme";
import { Badge, Card, Header, Section, StateView, Text } from "@/src/ui";
import { MembershipCard } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";

//const CUSTOMER_ID = "cust-1";

type CardVM = {
  subscription: Subscription;
  organizationUser: OrganizationUser;
  product: MembershipProduct;
  benefits: Benefit[];
};

/**
 * Subscriptions grouped by their Organization.
 *
 * The organization is resolved through OrganizationUser because the
 * final Subscription model intentionally does not contain organizationId.
 */
type OrgGroup = {
  organizationId: string;
  organizationName: string;

  /**
   * Each organization renders in its own business theme/style,
   * regardless of the currently active business.
   */
  theme: Theme;
  cardStyle: CardStyle;

  cards: CardVM[];
};

/**
 * Customer Membership Wallet.
 *
 * Subscriptions are resolved through:
 *
 * Customer
 *   -> OrganizationUser
 *      -> Subscription
 *         -> SubscriptionPlan
 *            -> MembershipProduct
 */
export default function MyCards() {
  const router = useRouter();

  const { organization, configuration, setActiveBusiness } = useBusiness();

  const { customerId, setActiveContext } = useCustomerContext();

  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [groups, setGroups] = useState<OrgGroup[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /**
       * Step 1:
       *
       * Find all organization-user relationships belonging to
       * the current global user/customer.
       */
      const organizationUsers =
        await mockServices.organization.listOrganizationUsersByUser(customerId);

      /**
       * Step 2:
       *
       * Get subscriptions for every organization-user relationship.
       */
      const subscriptionLists = await Promise.all(
        organizationUsers.map((organizationUser) =>
          mockServices.subscription.listByOrganizationUser(organizationUser.id),
        ),
      );

      const subscriptions = subscriptionLists.flat();

      const grouped: OrgGroup[] = [];

      /**
       * Step 3:
       *
       * Resolve the rest of the subscription relationships.
       */
      for (const subscription of subscriptions) {
        /**
         * Find the OrganizationUser that owns this subscription.
         *
         * We already loaded these above, so this is only an in-memory lookup.
         */
        const organizationUser = organizationUsers.find(
          (item) => item.id === subscription.organizationUserId,
        );

        if (!organizationUser) {
          continue;
        }

        /**
         * Subscription
         *     -> SubscriptionPlan
         */
        const plan = await mockServices.subscriptionPlan.getPlan(
          subscription.subscriptionPlanId,
        );

        if (!plan) {
          continue;
        }

        /**
         * SubscriptionPlan
         *     -> MembershipProduct
         */
        const product = await mockServices.membershipProduct.getProduct(
          plan.membershipProductId,
        );

        if (!product) {
          continue;
        }

        /**
         * MembershipProduct
         *     -> Benefits
         */
        const benefits = await mockServices.benefit.listByProduct(
          plan.membershipProductId,
        );

        /**
         * OrganizationUser
         *     -> Organization
         */
        const organizationId = organizationUser.organizationId;

        let group = grouped.find(
          (item) => item.organizationId === organizationId,
        );

        if (!group) {
          /**
           * Resolve THIS organization's own business context.
           *
           * This is important for the multi-business wallet:
           * Sunrise cards should use Sunrise branding,
           * Glow cards should use Glow branding, etc.
           */
          const ctx =
            await mockServices.organization.getBusinessContext(organizationId);

          const organizationName =
            ctx?.organization.displayName ?? organization.displayName;

          group = {
            organizationId,
            organizationName,

            theme: buildTheme(ctx?.configuration.branding),

            cardStyle:
              ctx?.configuration.customerExperience.cardStyle ??
              configuration.customerExperience.cardStyle,

            cards: [],
          };

          grouped.push(group);
        }

        group.cards.push({
          subscription,
          organizationUser,
          product,
          benefits,
        });
      }

      setGroups(grouped);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [
    customerId,
    organization.displayName,
    configuration.customerExperience.cardStyle,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Enter the selected business membership experience.
   */
  const openBusiness = (vm: CardVM) => {
    const organizationId = vm.organizationUser.organizationId;

    /**
     * Switch active business first so the business experience
     * gets the correct branding/configuration.
     */
    setActiveBusiness(organizationId);

    /**
     * Customer context contains:
     * organization + subscription
     */
    setActiveContext(organizationId, vm.subscription.id);

    router.push(`/business/${vm.subscription.id}`);
  };

  const hasCards = groups.some((group) => group.cards.length > 0);

  return (
    <Screen
      testID="customer-cards-screen"
      edges={["top"]}
      header={
        <Header
          title={t("cards.title")}
          subtitle={t("cards.subtitle")}
          testID="cards-header"
        />
      }
    >
      {status === "loading" ? (
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="cards-state"
        />
      ) : status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={load}
          testID="cards-state"
        />
      ) : !hasCards ? (
        <StateView
          kind="empty"
          title={t("cards.empty")}
          message={t("cards.emptyBody")}
          testID="cards-state"
        />
      ) : (
        groups.map((group) => (
          <BusinessThemeScope key={group.organizationId} theme={group.theme}>
            <Section
              title={group.organizationName}
              testID={`cards-group-${group.organizationId}`}
            >
              {group.cards.map((vm) => {
                /**
                 * The final Subscription model uses:
                 *
                 * startDate
                 * endDate
                 * subscriptionStatusId
                 */
                const isActive =
                  vm.subscription.subscriptionStatusId ===
                  "subscription-status-active";

                return (
                  <Pressable
                    key={vm.subscription.id}
                    testID={`card-${vm.subscription.id}`}
                    onPress={() => openBusiness(vm)}
                  >
                    <Card padding="md">
                      <MembershipCard
                        organizationName={group.organizationName}
                        tier={
                          vm.product.displayName ??
                          vm.product.membershipProductName
                        }
                        validUntil={
                          vm.subscription.endDate
                            ? formatDate(vm.subscription.endDate)
                            : "—"
                        }
                        active={isActive}
                        cardStyle={group.cardStyle}
                      />

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 12,
                        }}
                      >
                        <Text variant="bodySmall" color="textMuted">
                          {t("cards.benefitsSummary", {
                            count: vm.benefits.length,
                          })}
                        </Text>

                        <Badge label={t("cards.view")} tone="brand" />
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </Section>
          </BusinessThemeScope>
        ))
      )}
    </Screen>
  );
}
