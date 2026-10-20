import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  OrganizationUser,
  Status as DomainStatus,
  Subscription,
} from "@/src/core";
import { CardStyle } from "@/src/core";
import { services } from "@/src/core/services/service-registry";
import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import {
  BusinessThemeScope,
  useActiveBusinessControl,
  useCustomerContext,
  useTranslation,
} from "@/src/providers";
import { buildTheme, type Theme } from "@/src/theme/theme";
import { Badge, Card, Header, Section, StateView, Text } from "@/src/ui";
import { MembershipCard } from "@/src/ui/domain";
import { CustomerNotificationBell } from "@/src/ui/domain/CustomerNotificationBell";
import type { CustomerDiscoverableOrganization } from "@/src/data/api/customer-data-api";
import { entityStatusApi } from "@/src/data/api/entity-status-api";

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

/** Server-backed wallet for the authenticated customer. */
export default function MyCards() {
  const router = useRouter();
  const { setActiveBusiness } = useActiveBusinessControl();
  const {
    customerId,
    customersLoading,
    customersError,
    refreshCustomers,
    landing,
    membershipSummary,
    setActiveContext,
  } = useCustomerContext();
  const { t, formatDate } = useTranslation();

  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState<
    CustomerDiscoverableOrganization[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      if (!customerId || customersLoading || customersError || !landing) {
        setGroups([]);
        setDiscoverable([]);
        return;
      }

      let active = true;
      setLoading(true);
      setError(null);

      (async () => {
        try {
          const discoveries = landing.discoverableOrganizations;
          const relationships = landing.relationships.filter(
            (row) => row.userId === customerId,
          );
          const loaded = await Promise.all(
            relationships.map(async (relationship): Promise<OrgGroup> => {
              const organizationId = relationship.organizationId;

              const summary = await membershipSummary(organizationId);
              const {
                subscriptions,
                membershipProducts: products,
                benefits: allBenefits,
                branding,
              } = summary;

              const cards = await Promise.all(
                subscriptions.map(async (row): Promise<CardVM | null> => {
                  const product = products.find(
                    (item) => item.id === row.membershipProductId,
                  );

                  if (!product) {
                    return null;
                  }

                  const normalizedStatusId =
                    await entityStatusApi.resolveStatusId(
                      row.subscriptionStatusId,
                    );
                  const status =
                    await services.status.getStatus(normalizedStatusId);

                  return {
                    subscription: {
                      id: row.id,
                      subscriptionNumber: row.subscriptionNumber,
                      organizationUserId: row.organizationUserId,
                      subscriptionPlanId: row.subscriptionPlanId,
                      subscriptionDate: row.subscriptionDate,
                      startDate: row.startDate,
                      endDate: row.endDate,
                      subscriptionStatusId: normalizedStatusId,
                      totalAmount: {
                        amountMinor: Math.round(row.totalAmount * 100),
                        currency: row.currencyCode,
                      },
                      createdAt: row.createdAt,
                      createdBy: customerId,
                      updatedAt: row.createdAt,
                      updatedBy: customerId,
                      isDeleted: false,
                      versionNo: 1,
                    },
                    subscriptionStatus: status ?? undefined,
                    organizationUser: {
                      id: relationship.organizationUserId,
                      organizationId,
                      userId: customerId,
                      organizationUserTypeId:
                        relationship.organizationUserTypeId,
                      organizationUserStatusId:
                        relationship.organizationUserStatusId,
                      joiningDate: relationship.joiningDate,
                      isDeleted: false,
                    } as OrganizationUser,
                    product,
                    benefits: allBenefits.filter((benefit) =>
                      product.benefitIds.includes(benefit.id),
                    ),
                  };
                }),
              );

              return {
                organizationId,
                organizationName: relationship.organizationName,
                theme: buildTheme(
                  branding
                    ? {
                        primaryColor: branding.primaryColor,
                        secondaryColor: branding.secondaryColor,
                        accentColor: branding.accentColor,
                      }
                    : undefined,
                ),
                cardStyle: CardStyle.MODERN,
                logoUrl: branding?.logoUrl,
                cards: cards.filter((card): card is CardVM => card !== null),
              };
            }),
          );

          if (!active) {
            return;
          }

          /*
           * Discovery is for businesses the customer does not already hold
           * a membership with. A relationship without any membership remains
           * discoverable so the customer can still join.
           */
          const memberOrganizationIds = new Set(
            loaded
              .filter((group) => group.cards.length > 0)
              .map((group) => group.organizationId),
          );
          const relationshipOrganizationIds = new Set(
            relationships.map((relationship) => relationship.organizationId),
          );

          const sortedDiscoverable = discoveries
            .filter(
              (business) => !memberOrganizationIds.has(business.organizationId),
            )
            .sort((a, b) => {
              const aHasRelationship = relationshipOrganizationIds.has(
                a.organizationId,
              );
              const bHasRelationship = relationshipOrganizationIds.has(
                b.organizationId,
              );

              if (aHasRelationship !== bHasRelationship) {
                return aHasRelationship ? -1 : 1;
              }

              const aName = (a.displayName || a.name || "").trim();
              const bName = (b.displayName || b.name || "").trim();

              return aName.localeCompare(bName, undefined, {
                sensitivity: "base",
              });
            });

          setGroups(loaded);
          setDiscoverable(sortedDiscoverable);
        } catch (failure) {
          if (active) {
            setGroups([]);
            setDiscoverable([]);
            setError(
              failure instanceof Error
                ? failure.message
                : "Unable to load memberships.",
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();

      return () => {
        active = false;
      };
    }, [
      customerId,
      customersLoading,
      customersError,
      landing,
      membershipSummary,
    ]),
  );

  const openBusiness = (card: CardVM) => {
    setActiveBusiness(card.organizationUser.organizationId);
    setActiveContext(
      card.organizationUser.organizationId,
      card.subscription.id,
    );
    router.push(
      APP_ROUTES.business.subscription(card.subscription.id) as never,
    );
  };

  const openDiscovery = (organizationId: string) => {
    router.push(APP_ROUTES.discover.organization(organizationId) as never);
  };
  const activeGroups = groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter(
        (card) =>
          card.subscriptionStatus?.statusCode?.toUpperCase() === "ACTIVE",
      ),
    }))
    .filter((group) => group.cards.length > 0);

  const historicalGroups = groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter(
        (card) =>
          card.subscriptionStatus?.statusCode?.toUpperCase() !== "ACTIVE",
      ),
    }))
    .filter((group) => group.cards.length > 0);
  return (
    <Screen
      testID="customer-cards-screen"
      edges={["top"]}
      header={
        <Header
          title={t("cards.title")}
          subtitle={t("cards.subtitle")}
          right={<CustomerNotificationBell />}
          testID="cards-header"
        />
      }
    >
      {customersLoading || loading ? (
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="cards-state"
        />
      ) : customersError || error ? (
        <StateView
          kind="error"
          title={t("common.error")}
          message={customersError || error || undefined}
          actionLabel={t("common.retry")}
          onAction={() => void refreshCustomers()}
          testID="cards-state"
        />
      ) : (
        <>
          <Section title="My Memberships">
            {activeGroups.length === 0 ? (
              <StateView
                kind="empty"
                title={t("cards.empty")}
                message={t("cards.emptyBody")}
                testID="cards-state"
              />
            ) : (
              activeGroups.map((group) => (
                <BusinessThemeScope
                  key={group.organizationId}
                  theme={group.theme}
                >
                  <Section
                    title={group.organizationName}
                    testID={`cards-group-${group.organizationId}`}
                  >
                    {group.cards.map((card) => {
                      const plan = card.product.plans.find(
                        (item) =>
                          item.id === card.subscription.subscriptionPlanId,
                      );

                      return (
                        <Pressable
                          key={card.subscription.id}
                          testID={`card-${card.subscription.id}`}
                          onPress={() => openBusiness(card)}
                        >
                          <Card padding="md">
                            <MembershipCard
                              organizationName={group.organizationName}
                              logoUrl={group.logoUrl}
                              tier={[
                                plan?.subscriptionPlanName,
                                card.product.membershipProductName,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              validUntil={formatDate(card.subscription.endDate)}
                              status={card.subscriptionStatus}
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
                                  count: card.benefits.length,
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
          </Section>

          {historicalGroups.length > 0 && (
            <Section title="Membership History" testID="membership-history">
              {historicalGroups.map((group) => (
                <BusinessThemeScope
                  key={group.organizationId}
                  theme={group.theme}
                >
                  <Section title={group.organizationName}>
                    {group.cards.map((card) => {
                      const plan = card.product.plans.find(
                        (item) =>
                          item.id === card.subscription.subscriptionPlanId,
                      );

                      return (
                        <Pressable
                          key={card.subscription.id}
                          testID={`history-card-${card.subscription.id}`}
                          onPress={() => openBusiness(card)}
                        >
                          <Card padding="md">
                            <View style={{ gap: 8 }}>
                              <Text variant="bodyStrong">
                                {[
                                  plan?.subscriptionPlanName,
                                  card.product.membershipProductName,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              </Text>

                              <Badge
                                label={
                                  card.subscriptionStatus?.statusName ??
                                  "Status unavailable"
                                }
                                tone="neutral"
                              />

                              <Text variant="bodySmall" color="textMuted">
                                Subscription:{" "}
                                {card.subscription.subscriptionNumber}
                              </Text>

                              <Text variant="bodySmall" color="textMuted">
                                Original validity:{" "}
                                {formatDate(card.subscription.startDate)} –{" "}
                                {formatDate(card.subscription.endDate)}
                              </Text>

                              <Text variant="bodySmall" color="primary">
                                View membership history
                              </Text>
                            </View>
                          </Card>
                        </Pressable>
                      );
                    })}
                  </Section>
                </BusinessThemeScope>
              ))}
            </Section>
          )}

          <Section title="Discover Businesses" testID="customer-discovery">
            {discoverable.length === 0 ? (
              <Text variant="body" color="textSecondary">
                No other businesses are available to explore right now.
              </Text>
            ) : (
              discoverable.map((business) => (
                <Pressable
                  key={business.organizationId}
                  onPress={() => openDiscovery(business.organizationId)}
                  testID={`discover-${business.organizationId}`}
                >
                  <Card padding="md">
                    <Text variant="title">
                      {business.displayName || business.name}
                    </Text>

                    {business.tagline ? (
                      <Text variant="bodySmall" color="textSecondary">
                        {business.tagline}
                      </Text>
                    ) : null}

                    <Badge label="Explore memberships" tone="brand" />
                  </Card>
                </Pressable>
              ))
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
