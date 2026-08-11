import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { SubscriptionStatus } from "@/src/core";
import type { Benefit, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { Badge, Card, Header, Modal, Section, StateView, Text } from "@/src/ui";
import { BenefitItem, benefitIconForType, MembershipCard, QrPlaceholder } from "@/src/ui/domain";

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
  cards: CardVM[];
};

export default function MyCards() {
  const { organization, configuration } = useBusiness();
  const { setActiveContext } = useCustomerContext();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [selected, setSelected] = useState<CardVM | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      // Customer -> Subscription -> (Product, Organization). Grouping by
      // organization here means adding a second org later needs NO screen
      // change; the model never assumes one subscription / one organization.
      const subs = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      const grouped: OrgGroup[] = [];
      for (const sub of subs) {
        const product = await mockServices.membershipProduct.getProduct(sub.membershipProductId);
        if (!product) continue;
        const benefits = await mockServices.benefit.listByProduct(sub.membershipProductId);
        const org = await mockServices.organization.getOrganization(sub.organizationId);
        const orgName = org?.displayName ?? organization.displayName;

        let group = grouped.find((g) => g.organizationId === sub.organizationId);
        if (!group) {
          group = { organizationId: sub.organizationId, organizationName: orgName, cards: [] };
          grouped.push(group);
        }
        group.cards.push({ subscription: sub, product, benefits });
      }
      setGroups(grouped);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [organization.displayName]);

  useEffect(() => {
    load();
  }, [load]);

  const cardStyle = configuration.customerExperience.cardStyle;

  const openCard = (vm: CardVM) => {
    // Selecting a card establishes the active Organization + Subscription
    // context for the customer experience.
    setActiveContext(vm.subscription.organizationId, vm.subscription.id);
    setSelected(vm);
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
          <Section
            key={group.organizationId}
            title={group.organizationName}
            testID={`cards-group-${group.organizationId}`}
          >
            {group.cards.map((vm) => (
              <Pressable
                key={vm.subscription.id}
                testID={`card-${vm.subscription.id}`}
                onPress={() => openCard(vm)}
              >
                <Card padding="md">
                  <MembershipCard
                    organizationName={group.organizationName}
                    tier={vm.product.tier ?? vm.product.name}
                    validUntil={
                      vm.subscription.currentPeriodEnd ? formatDate(vm.subscription.currentPeriodEnd) : "—"
                    }
                    active={vm.subscription.status === SubscriptionStatus.ACTIVE}
                    cardStyle={cardStyle}
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
        ))
      )}

      <Modal
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={t("cards.detailTitle")}
        scrollable
        testID="card-detail-modal"
      >
        {selected ? (
          <View style={{ gap: 20 }}>
            <MembershipCard
              organizationName={organization.displayName}
              tier={selected.product.tier ?? selected.product.name}
              validUntil={
                selected.subscription.currentPeriodEnd
                  ? formatDate(selected.subscription.currentPeriodEnd)
                  : "—"
              }
              active={selected.subscription.status === SubscriptionStatus.ACTIVE}
              cardStyle={cardStyle}
            />
            <QrPlaceholder caption={t("cards.showAtCounter")} testID="card-detail-qr" />
            {selected.benefits.length ? (
              <Section title={t("benefits.activeTitle")}>
                <View style={{ gap: 14 }}>
                  {selected.benefits.map((b) => (
                    <BenefitItem
                      key={b.id}
                      title={b.title}
                      subtitle={b.description}
                      icon={benefitIconForType(b.type)}
                    />
                  ))}
                </View>
              </Section>
            ) : null}
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
