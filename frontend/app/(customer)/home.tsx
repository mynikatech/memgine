import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useBusiness, useTheme } from "@/src/business";
import { Banner, Button, MembershipCard, OfferCard, StatusView } from "@/src/design-system";
import { useTranslation } from "@/src/i18n";
import { Screen } from "@/src/layout";
import { service } from "@/src/services";
import type { Membership, Offer } from "@/src/services";

/**
 * Foundation proof (Stage 2): the SAME screen renders two different businesses
 * purely from BusinessConfiguration — branding, theme and content flow through
 * BusinessProvider + the typed service layer. No business-specific code.
 */
const BUSINESSES = [
  { id: "biz-a", label: "Bean & Bloom" },
  { id: "biz-b", label: "Crust & Crumb" },
];

type LoadState = "loading" | "error" | "ready";

export default function CustomerHome() {
  const { business, selectBusiness } = useBusiness();
  const { colors, spacing, fontSize, fontWeight } = useTheme();
  const { t } = useTranslation();

  const [state, setState] = useState<LoadState>("loading");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);

  const load = useCallback(
    async (businessId: string) => {
      setState("loading");
      try {
        const config = await selectBusiness(businessId);
        const [memberships, orgOffers] = await Promise.all([
          service.getMyMemberships(),
          service.getOffers(config.organizationId),
        ]);
        setMembership(memberships.find((m) => m.organizationId === config.organizationId) ?? null);
        setOffers(orgOffers);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [selectBusiness],
  );

  useEffect(() => {
    load("biz-a");
  }, [load]);

  return (
    <Screen testID="customer-home-screen">
      <Banner
        testID="home-welcome-banner"
        title={business ? business.branding.logoText : t("app.name")}
        subtitle={t("customer.home.subtitle")}
      />

      <Text
        style={{
          marginTop: spacing.md,
          marginBottom: 8,
          color: colors.textMuted,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.semibold,
          letterSpacing: 0.3,
        }}
      >
        {t("foundation.switchLabel")}
      </Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {BUSINESSES.map((biz) => (
          <View key={biz.id} style={{ flex: 1 }}>
            <Button
              testID={`switch-${biz.id}`}
              label={biz.label}
              variant={business?.id === biz.id ? "primary" : "ghost"}
              fullWidth
              onPress={() => load(biz.id)}
            />
          </View>
        ))}
      </View>

      <View style={{ marginTop: spacing.md }}>
        {state === "loading" ? (
          <StatusView testID="home-status" state="loading" message={t("common.loading")} />
        ) : state === "error" ? (
          <StatusView
            testID="home-status"
            state="error"
            message={t("common.error")}
            onRetry={() => load(business?.id ?? "biz-a")}
          />
        ) : (
          <>
            {membership ? (
              <MembershipCard
                testID="home-membership-card"
                organizationName={membership.organizationName}
                tier={membership.tier}
                validUntil={membership.validUntil}
                status={membership.status}
              />
            ) : null}
            <Text
              style={{
                marginTop: spacing.md,
                marginBottom: 8,
                color: colors.text,
                fontSize: fontSize.lg,
                fontWeight: fontWeight.bold,
              }}
            >
              {t("customer.home.offers")}
            </Text>
            <View style={{ gap: 12 }}>
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  testID={`offer-${offer.id}`}
                  title={offer.title}
                  description={offer.description}
                  badge={offer.badge}
                  validUntil={offer.validUntil}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
