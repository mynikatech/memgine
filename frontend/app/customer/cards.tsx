import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type { Benefit, MembershipProduct, OrganizationUser, Subscription, Status as DomainStatus } from "@/src/core";
import { CardStyle, services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import { BusinessThemeScope, useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { buildTheme, type Theme } from "@/src/theme/theme";
import { Badge, Card, Header, Section, StateView, Text } from "@/src/ui";
import { MembershipCard, OfferCard } from "@/src/ui/domain";
import { CustomerNotificationBell } from "@/src/ui/domain/CustomerNotificationBell";
import type { CustomerCombinedOffer, CustomerDiscoverableOrganization } from "@/src/data/api/customer-data-api";

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
type OfferGroup = {
  organization: CustomerDiscoverableOrganization;
  offers: CustomerCombinedOffer[];
};

/** Server-backed wallet for the authenticated customer. */
export default function MyCards() {
  const router = useRouter();
  const { configuration, setActiveBusiness } = useBusiness();
  const { customerId, profiles, customersLoading, customersError,
    refreshCustomers, setActiveContext } = useCustomerContext();
  const { t, formatDate } = useTranslation();
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState<CustomerDiscoverableOrganization[]>([]);
  const [offerGroups, setOfferGroups] = useState<OfferGroup[]>([]);

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
        const discoveries = await services.customerData.discoverOrganizations();
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
            theme: buildTheme(branding
              ? {
                  primaryColor: branding.primaryColor,
                  secondaryColor: branding.secondaryColor,
                  accentColor: branding.accentColor,
                }
              : undefined),
            cardStyle: configuration.customerExperience.cardStyle ?? CardStyle.MODERN,
            logoUrl: branding?.logoUrl,
            cards: cards.filter((card): card is CardVM => card !== null),
          };
        }));
        const loadedOffers = await Promise.all(discoveries.map(async (organization) => ({
          organization,
          offers: await services.customerData.combinedOffers(organization.organizationId),
        })));
        if (active) {
          setGroups(loaded);
          setDiscoverable(discoveries);
          setOfferGroups(loadedOffers.filter((group) =>
            group.offers.some((offer) => offer.offerType === "REGULAR"),
          ));
        }
      } catch (failure) {
        if (active) {
          setGroups([]); setDiscoverable([]); setOfferGroups([]);
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

  const openDiscovery = (organizationId: string) => {
    router.push(APP_ROUTES.discover.organization(organizationId) as never);
  };

  return (
    <Screen testID="customer-cards-screen" edges={["top"]}
      header={<Header title={t("cards.title")} subtitle={t("cards.subtitle")} right={<CustomerNotificationBell />} testID="cards-header" />}>
      {customersLoading || loading ? (
        <StateView kind="loading" message={t("common.loading")} testID="cards-state" />
      ) : customersError || error ? (
        <StateView kind="error" title={t("common.error")} message={customersError || error || undefined}
          actionLabel={t("common.retry")} onAction={() => void refreshCustomers()} testID="cards-state" />
      ) : <>
        <Section title="Discover Businesses" testID="customer-discovery">
          {discoverable.length === 0 ? (
            <Text variant="body" color="textSecondary">No businesses are available to explore right now.</Text>
          ) : discoverable.map((business) => (
            <Pressable key={business.organizationId} onPress={() => openDiscovery(business.organizationId)} testID={`discover-${business.organizationId}`}>
              <Card padding="md"><Text variant="title">{business.displayName || business.name}</Text>
                {business.tagline ? <Text variant="bodySmall" color="textSecondary">{business.tagline}</Text> : null}
                <Badge label="Explore memberships" tone="brand" />
              </Card>
            </Pressable>
          ))}
        </Section>
        <Section title="Offers" testID="customer-offers">
          {!offerGroups.length ? (
            <Text variant="body" color="textSecondary">No offers are available right now.</Text>
          ) : offerGroups.map(({ organization, offers }) => (
            <View key={organization.organizationId} style={{ gap: 8 }}>
              <Text variant="bodyStrong" color="text">{organization.displayName || organization.name}</Text>
              {offers.some((offer) => offer.offerType === "REGULAR") ? (
                <View style={{ gap: 8 }}>
                  {offers.filter((offer) => offer.offerType === "REGULAR").map((offer) => offer.regularOffer ? (
                <OfferCard key={offer.offerId} offerId={offer.regularOffer.id}
                  title={offer.regularOffer.offerName}
                  description={offer.regularOffer.description}
                  imageUrl={offer.regularOffer.promotionImageUrl}
                  badge={offer.regularOffer.badgeText}
                  availabilityText={offer.regularOffer.availabilityText}
                  disclaimerText={offer.regularOffer.disclaimerText}
                  discountPercentage={offer.regularOffer.discountPercentage}
                  usageRules={[]}
                  testID={`regular-offer-${offer.offerId}`} />
                  ) : null)}
                </View>
              ) : null}
            </View>
          ))}
        </Section>
        <Section title="My Memberships">
        {!groups.some((group) => group.cards.length > 0) ? (
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
        </Section>
      </>}
    </Screen>
  );
}
