import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { SecondarySectionKey, SubscriptionStatus } from "@/src/core";
import type { Benefit, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useTranslation } from "@/src/providers";
import { Card, Section, StateView, Text } from "@/src/ui";
import { BenefitItem, BusinessHeader, MembershipCard } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";

/** Dev customer identity (mock). */
const CUSTOMER_ID = "cust-1";

export default function CustomerHome() {
  const { organization, configuration, template } = useBusiness();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const subs = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      const sub = subs.find((s) => s.organizationId === organization.id) ?? subs[0] ?? null;
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
  }, [organization.id]);

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
      header={<BusinessHeader subtitle={t("home.subtitle")} testID="home-business-header" />}
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
          <Card testID="home-welcome" padding="lg">
            <Text variant="h2" color="text" testID="home-welcome-title">
              {cx.welcomeMessage}
            </Text>
          </Card>

          {subscription && product ? (
            <Section title={t("home.yourMembership")} testID="home-membership-section">
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
            <Section title={t("benefits.title")} testID="home-benefits-section">
              <Card padding="lg">
                <View style={{ gap: 16 }}>
                  {benefits.map((b) => (
                    <BenefitItem
                      key={b.id}
                      testID={`home-benefit-${b.id}`}
                      title={b.title}
                      subtitle={b.description}
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
