import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import type { Benefit, MembershipProduct, OrganizationUser, Subscription, Status as DomainStatus } from "@/src/core";
import { CardStyle, services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import { BusinessThemeScope, useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { buildTheme, type Theme } from "@/src/theme/theme";
import { Badge, Card, Header, ReferenceSelect, Section, StateView, Text } from "@/src/ui";
import { MembershipCard } from "@/src/ui/domain";

type CardVM = {
  subscription: Subscription;
  subscriptionStatus?: DomainStatus;
  organizationUser: OrganizationUser;
  product: MembershipProduct;
  benefits: Benefit[];
};
type OrgGroup = {
  organizationId: string;
  organizationName: string;
  theme: Theme;
  cardStyle: CardStyle;
  logoUrl?: string;
  cards: CardVM[];
};

/** Server-backed wallet with a temporary Local/Dev customer selector. */
export default function MyCards() {
  const router = useRouter();
  const { configuration, setActiveBusiness } = useBusiness();
  const { customerId, customerChoices, profiles, customersLoading, customersError,
    refreshCustomers, setActiveContext, setActiveCustomer } = useCustomerContext();
  const { t, formatDate } = useTranslation();
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    return customerChoices.map((choice) => ({ id: choice.userId, name: choice.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customerChoices]);

  useFocusEffect(useCallback(() => {
    if (!customerId || customersLoading || customersError) {
      setGroups([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const relationships = profiles.filter((row) => row.userId === customerId);
        const loaded = await Promise.all(relationships.map(async (relationship): Promise<OrgGroup> => {
          const organizationId = relationship.organizationId;
          const [subscriptions, products, allBenefits, branding] = await Promise.all([
            services.customerData.subscriptions(organizationId, customerId),
            services.customerData.membershipProducts(organizationId, customerId),
            services.customerData.benefits(organizationId, customerId),
            services.organization.getOrganizationBranding(organizationId),
          ]);
          const cards = await Promise.all(subscriptions.map(async (row): Promise<CardVM | null> => {
            const product = products.find((item) => item.id === row.membershipProductId);
            if (!product) return null;
            const status = await services.status.getStatus(row.subscriptionStatusId);
            return {
              subscription: {
                id: row.id, subscriptionNumber: row.subscriptionNumber,
                organizationUserId: row.organizationUserId, subscriptionPlanId: row.subscriptionPlanId,
                subscriptionDate: row.subscriptionDate, startDate: row.startDate, endDate: row.endDate,
                subscriptionStatusId: row.subscriptionStatusId,
                totalAmount: { amountMinor: Math.round(row.totalAmount * 100), currency: row.currencyCode },
                createdAt: row.createdAt, createdBy: customerId, updatedAt: row.createdAt,
                updatedBy: customerId, isDeleted: false, versionNo: 1,
              },
              subscriptionStatus: status ?? undefined,
              organizationUser: {
                id: relationship.organizationUserId, organizationId, userId: customerId,
                organizationUserTypeId: relationship.organizationUserTypeId,
                organizationUserStatusId: relationship.organizationUserStatusId,
                joiningDate: relationship.joiningDate, isDeleted: false,
              } as OrganizationUser,
              product,
              benefits: allBenefits.filter((benefit) => product.benefitIds.includes(benefit.id)),
            };
          }));
          return {
            organizationId, organizationName: relationship.organizationName,
            theme: buildTheme(branding?.primaryColor && branding.secondaryColor
              ? { primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor }
              : undefined),
            cardStyle: configuration.customerExperience.cardStyle ?? CardStyle.MODERN,
            logoUrl: branding?.logoUrl,
            cards: cards.filter((card): card is CardVM => card !== null),
          };
        }));
        if (active) setGroups(loaded);
      } catch (failure) {
        if (active) {
          setGroups([]);
          setError(failure instanceof Error ? failure.message : "Unable to load memberships.");
        }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [customerId, customersLoading, customersError, profiles, configuration.customerExperience.cardStyle]));

  const openBusiness = (card: CardVM) => {
    setActiveBusiness(card.organizationUser.organizationId);
    setActiveContext(card.organizationUser.organizationId, card.subscription.id);
    router.push(APP_ROUTES.business.subscription(card.subscription.id) as never);
  };

  return (
    <Screen testID="customer-cards-screen" edges={["top"]}
      header={<Header title={t("cards.title")} subtitle={t("cards.subtitle")} testID="cards-header" />}>
      {options.length > 0 ? (
        <Card padding="md">
          <ReferenceSelect label="Customer (temporary test selector)" value={customerId}
            items={options} onChange={setActiveCustomer} placeholder="Select customer" testID="customer-selector" />
          <View style={{ marginTop: 8 }}>
            <Text variant="caption" color="textMuted">Local/Dev selection; authentication will replace this later.</Text>
          </View>
        </Card>
      ) : null}
      {customersLoading || loading ? (
        <StateView kind="loading" message={t("common.loading")} testID="cards-state" />
      ) : customersError || error ? (
        <StateView kind="error" title={t("common.error")} message={customersError || error || undefined}
          actionLabel={t("common.retry")} onAction={() => void refreshCustomers()} testID="cards-state" />
      ) : !groups.some((group) => group.cards.length > 0) ? (
        <StateView kind="empty" title={t("cards.empty")} message={t("cards.emptyBody")} testID="cards-state" />
      ) : groups.map((group) => (
        <BusinessThemeScope key={group.organizationId} theme={group.theme}>
          <Section title={group.organizationName} testID={"cards-group-" + group.organizationId}>
            {group.cards.map((card) => {
              const plan = card.product.plans.find((item) => item.id === card.subscription.subscriptionPlanId);
              const active = card.subscriptionStatus?.statusCode?.toUpperCase() === "ACTIVE";
              return (
                <Pressable key={card.subscription.id} testID={"card-" + card.subscription.id}
                  onPress={() => openBusiness(card)}>
                  <Card padding="md">
                    <MembershipCard organizationName={group.organizationName} logoUrl={group.logoUrl}
                      tier={[plan?.subscriptionPlanName, card.product.membershipProductName].filter(Boolean).join(" ")}
                      validUntil={formatDate(card.subscription.endDate)} active={active}
                      cardStyle={group.cardStyle} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                      <Text variant="bodySmall" color="textMuted">
                        {t("cards.benefitsSummary", { count: card.benefits.length })}
                      </Text>
                      <Badge label={t("cards.view")} tone="brand" />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </Section>
        </BusinessThemeScope>
      ))}
    </Screen>
  );
}
