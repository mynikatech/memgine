import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { SubscriptionStatus } from "@/src/core";
import type { Benefit, CardStyle, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { BusinessThemeScope, useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { buildTheme, Theme } from "@/src/theme/theme";
import { Badge, Card, Header, Section, StateView, Text } from "@/src/ui";
import { MembershipCard } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";
const CUSTOMER_ID = "cust-1";

type CardVM = {
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
};

/** Subscriptions grouped by their Organization — ready for multiple orgs. */
type OrgGroup = {
  organizationId: string;
  organizationName: string;
  /** Each group renders in ITS OWN business theme/style, not the active one. */
  theme: Theme;
  cardStyle: CardStyle;
  cards: CardVM[];
};

/**
 * Your Memberships — the Memgine platform wallet (top level). Selecting a
 * membership enters that business's branded experience (a pushed route that
 * covers the platform tabs). Grouped by organization so adding a second org
 * later needs NO screen change.
 */
export default function MyCards() {
  const router = useRouter();
  const { organization, configuration, setActiveBusiness } = useBusiness();
  const { setActiveContext } = useCustomerContext();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [groups, setGroups] = useState<OrgGroup[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const subs = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      const grouped: OrgGroup[] = [];
      for (const sub of subs) {
        const product = await mockServices.membershipProduct.getProduct(sub.membershipProductId);
        if (!product) continue;
        const benefits = await mockServices.benefit.listByProduct(sub.membershipProductId);

        let group = grouped.find((g) => g.organizationId === sub.organizationId);
        if (!group) {
          // Resolve THIS organization's own branding so its cards always render
          // in its own theme/style, regardless of the active business.
          const ctx = await mockServices.organization.getBusinessContext(sub.organizationId);
          const orgName = ctx?.organization.displayName ?? organization.displayName;
          group = {
            organizationId: sub.organizationId,
            organizationName: orgName,
            theme: buildTheme(ctx?.configuration.branding),
            cardStyle: ctx?.configuration.customerExperience.cardStyle ?? configuration.customerExperience.cardStyle,
            cards: [],
          };
          grouped.push(group);
        }
        group.cards.push({ subscription: sub, product, benefits });
      }
      setGroups(grouped);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [organization.displayName, configuration.customerExperience.cardStyle]);

  useEffect(() => {
    load();
  }, [load]);

  const openBusiness = (vm: CardVM) => {
    // Switch the active business (branding/template/locale) + subscription
    // context, then enter the business experience.
    setActiveBusiness(vm.subscription.organizationId);
    setActiveContext(vm.subscription.organizationId, vm.subscription.id);
    router.push(`/business/${vm.subscription.id}`);
  };

  const hasCards = groups.some((g) => g.cards.length > 0);

  return (
    <Screen
      testID="customer-cards-screen"
      edges={["top"]}
      header={<Header title={t("cards.title")} subtitle={t("cards.subtitle")} testID="cards-header" />}
    >
      {status === "loading" ? (
        <StateView kind="loading" message={t("common.loading")} testID="cards-state" />
      ) : status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={load}
          testID="cards-state"
        />
      ) : !hasCards ? (
        <StateView kind="empty" title={t("cards.empty")} message={t("cards.emptyBody")} testID="cards-state" />
      ) : (
        groups.map((group) => (
          <BusinessThemeScope key={group.organizationId} theme={group.theme}>
            <Section
              title={group.organizationName}
              testID={`cards-group-${group.organizationId}`}
            >
              {group.cards.map((vm) => (
                <Pressable
                  key={vm.subscription.id}
                  testID={`card-${vm.subscription.id}`}
                  onPress={() => openBusiness(vm)}
                >
                  <Card padding="md">
                    <MembershipCard
                      organizationName={group.organizationName}
                      tier={vm.product.tier ?? vm.product.name}
                      validUntil={
                        vm.subscription.currentPeriodEnd ? formatDate(vm.subscription.currentPeriodEnd) : "—"
                      }
                      active={vm.subscription.status === SubscriptionStatus.ACTIVE}
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
                        {t("cards.benefitsSummary", { count: vm.benefits.length })}
                      </Text>
                      <Badge label={t("cards.view")} tone="brand" />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </Section>
          </BusinessThemeScope>
        ))
      )}
    </Screen>
  );
}
