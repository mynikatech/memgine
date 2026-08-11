import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { SubscriptionStatus } from "@/src/core";
import type { Benefit, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useTranslation } from "@/src/providers";
import { Badge, Card, Header, Modal, Section, StateView, Text } from "@/src/ui";
import { BenefitItem, benefitIconForType, MembershipCard, QrPlaceholder } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";
const CUSTOMER_ID = "cust-1";

type CardVM = {
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
  organizationName: string;
};

export default function MyCards() {
  const { organization, configuration } = useBusiness();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [cards, setCards] = useState<CardVM[]>([]);
  const [selected, setSelected] = useState<CardVM | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      // Customer → Subscription → Organization. Iterating the customer's
      // subscriptions here keeps My Cards ready to hold multiple business
      // cards in future without changing this screen.
      const subs = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      const vms: CardVM[] = [];
      for (const sub of subs) {
        const product = await mockServices.membershipProduct.getProduct(sub.membershipProductId);
        if (!product) continue;
        const benefits = await mockServices.benefit.listByProduct(sub.membershipProductId);
        const org = await mockServices.organization.getOrganization(sub.organizationId);
        vms.push({
          subscription: sub,
          product,
          benefits,
          organizationName: org?.displayName ?? organization.displayName,
        });
      }
      setCards(vms);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [organization.displayName]);

  useEffect(() => {
    load();
  }, [load]);

  const cardStyle = configuration.customerExperience.cardStyle;

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
      ) : cards.length === 0 ? (
        <StateView kind="empty" title={t("cards.empty")} message={t("cards.emptyBody")} testID="cards-state" />
      ) : (
        cards.map((vm) => (
          <Pressable
            key={vm.subscription.id}
            testID={`card-${vm.subscription.id}`}
            onPress={() => setSelected(vm)}
          >
            <Card padding="md">
              <MembershipCard
                organizationName={vm.organizationName}
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
              organizationName={selected.organizationName}
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
