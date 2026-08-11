import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { SecondarySectionKey, SubscriptionStatus } from "@/src/core";
import type { Benefit, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { Card, Badge, Section, StateView, Text } from "@/src/ui";
import { BenefitItem, benefitIconForType, BusinessHeader, MembershipCard } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";

/** Dev customer identity (mock). */
const CUSTOMER_ID = "cust-1";

export default function CustomerHome() {
  const router = useRouter();
  const { organization, configuration, template } = useBusiness();
  const { subscriptionId: activeSubscriptionId } = useCustomerContext();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const subs = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      // Render against the active subscription context when one has been
      // selected (from My Cards); otherwise fall back to this business's first
      // subscription. Foundation only — no multi-business switching.
      const sub =
        (activeSubscriptionId ? subs.find((s) => s.id === activeSubscriptionId) : null) ??
        subs.find((s) => s.organizationId === organization.id) ??
        subs[0] ??
        null;
      let prod: MembershipProduct | null = null;
      let bens: Benefit[] = [];
      if (sub) {
        prod = await mockServices.membershipProduct.getProduct(sub.membershipProductId);
        bens = await mockServices.benefit.listByProduct(sub.membershipProductId);
      }
      setSubscription(sub);
      setProduct(prod);
      setBenefits(bens);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [organization.id, activeSubscriptionId]);

  useEffect(() => {
    load();
  }, [load]);

  const cx = configuration.customerExperience;
  const sectionVisible = (key: SecondarySectionKey, flag: boolean) =>
    template.secondarySections.includes(key) && flag;

  return (
    <Screen
      testID="customer-home-screen"
      edges={["top"]}
      header={<BusinessHeader testID="home-business-header" />}
    >
      {status === "loading" ? (
        <StateView kind="loading" message={t("common.loading")} testID="home-state" />
      ) : status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={load}
          testID="home-state"
        />
      ) : (
        <>
          <Text variant="title" color="textSecondary" testID="home-welcome-title">
            {cx.welcomeMessage}
          </Text>

          <Pressable testID="home-join-cta" onPress={() => router.push("/join")}>
            <Card padding="lg">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="text">
                    {t("home.discoverTitle", { business: organization.displayName })}
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    {t("home.discoverBody")}
                  </Text>
                </View>
                <Badge label={t("home.discoverCta")} tone="brand" />
              </View>
            </Card>
          </Pressable>

          {subscription && product ? (
            <Section title={t("home.yourSubscription")} testID="home-subscription-section">
              <MembershipCard
                testID="home-membership-card"
                organizationName={organization.displayName}
                tier={product.tier ?? product.name}
                validUntil={subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "—"}
                active={subscription.status === SubscriptionStatus.ACTIVE}
                cardStyle={cx.cardStyle}
              />
            </Section>
          ) : null}

          {benefits.length ? (
            <Section title={t("benefits.activeTitle")} testID="home-benefits-section">
              <Card padding="lg">
                <View style={{ gap: 18 }}>
                  {benefits.map((b) => (
                    <BenefitItem
                      key={b.id}
                      testID={`home-benefit-${b.id}`}
                      title={b.title}
                      subtitle={b.description}
                      icon={benefitIconForType(b.type)}
                    />
                  ))}
                </View>
              </Card>
            </Section>
          ) : null}

          {sectionVisible(SecondarySectionKey.OFFERS, cx.showOffers) ? (
            <Section title={t("sections.offers")} testID="home-offers-section">
              <Card padding="lg">
                <Text variant="bodySmall" color="textMuted">
                  {t("home.offersEmpty")}
                </Text>
              </Card>
            </Section>
          ) : null}

          {sectionVisible(SecondarySectionKey.STORES, cx.showStores) ? (
            <Section title={t("sections.stores")} testID="home-stores-section">
              <Card padding="lg">
                <Text variant="bodySmall" color="textMuted">
                  {t("home.storesEmpty")}
                </Text>
              </Card>
            </Section>
          ) : null}

          {sectionVisible(SecondarySectionKey.ACTIVITY, cx.showActivity) ? (
            <Section title={t("sections.activity")} testID="home-activity-section">
              <Card padding="lg">
                <Text variant="bodySmall" color="textMuted">
                  {t("home.activityEmpty")}
                </Text>
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
