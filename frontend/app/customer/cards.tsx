import { potentialSavingsLabel } from "@/src/core/domain/savings-display";
import {
  activeMembershipPlanIds,
  discoverableMembershipPlans,
  discoveryMembershipAction,
} from "@/src/core/domain/membership-helpers";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

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
  useActiveBusinessControl,
  useCustomerContext,
  useTranslation,
  useTheme,
} from "@/src/providers";
import { buildTheme, type Theme } from "@/src/theme/theme";
import { Badge, Card, Header, StateView, Text } from "@/src/ui";
import { CustomerNotificationBell } from "@/src/ui/domain/CustomerNotificationBell";
import type { CustomerDiscoverableOrganization } from "@/src/data/api/customer-data-api";
import { entityStatusApi } from "@/src/data/api/entity-status-api";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

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

function BusinessLogo({
  url,
  organizationId,
  name,
}: {
  url?: string | null;
  organizationId: string;
  name: string;
}) {
  const theme = useTheme();
  // An organization-scoped uploaded asset must belong to this business.
  const assetOwner = url?.match(
    /\/api\/v1\/assets\/organizations\/([^/]+)\//,
  )?.[1];
  const resolved =
    assetOwner &&
    assetOwner !== encodeURIComponent(organizationId) &&
    assetOwner !== organizationId
      ? undefined
      : resolveAssetUrl(url);
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  if (resolved && failedUrl !== resolved) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setFailedUrl(resolved)}
        accessibilityLabel={name + " logo"}
        resizeMode="contain"
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name + " logo unavailable"}
      style={{
        width: 64,
        height: 64,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name="storefront-outline"
        size={26}
        color={theme.colors.textMuted}
      />
    </View>
  );
}

function DiscoveryImage({
  business,
}: {
  business: CustomerDiscoverableOrganization;
}) {
  const theme = useTheme();
  const uri = resolveAssetUrl(business.heroImageUrl);
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  if (uri && uri !== failedUrl) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailedUrl(uri)}
        accessibilityLabel={(business.displayName || business.name) + " image"}
        resizeMode="cover"
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      />
    );
  }
  return (
    <BusinessLogo
      url={business.logoUrl}
      organizationId={business.organizationId}
      name={business.displayName || business.name}
    />
  );
}

/** Server-backed wallet for the authenticated customer. */
export default function MyCards() {
  return <CustomerLanding mode="home" />;
}
export function CustomerLanding({
  mode,
}: {
  mode: "home" | "memberships" | "businesses";
}) {
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
    organizationId: currentOrganizationId,
    subscriptionId: currentSubscriptionId,
  } = useCustomerContext();
  const { t, formatDate } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");

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
                    throw new Error("Membership product is unavailable.");
                  }

                  const normalizedStatusId =
                    await entityStatusApi.resolveStatusId(
                      row.subscriptionStatusId,
                    );
                  const status =
                    await services.status.getStatus(normalizedStatusId);
                  if (!status)
                    throw new Error("Membership status is unavailable.");

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

          const sortedDiscoverable = [...discoveries].sort((a, b) =>
            (a.displayName || a.name).localeCompare(
              b.displayName || b.name,
              undefined,
              { sensitivity: "base" },
            ),
          );
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

  const owned = groups.filter((group) => group.cards.length > 0);
  const code = (card: CardVM) =>
    card.subscriptionStatus?.statusCode?.toUpperCase();
  const allCards = owned.flatMap((group) => group.cards);
  const counts = {
    all: allCards.length,
    active: allCards.filter((card) => code(card) === "ACTIVE").length,
    expired: allCards.filter((card) => code(card) === "EXPIRED").length,
  };
  const businesses = discoverable.filter((business) =>
    [business.name, business.displayName].some((name) =>
      name?.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  const displayedBusinesses = mode === "memberships" ? [] : businesses;
  const displayedIds = JSON.stringify(
    displayedBusinesses.map((business) => business.organizationId),
  );
  const [publishedPlans, setPublishedPlans] = useState<
    Record<string, { id: string }[]>
  >({});
  const planCache = useRef({
    landing,
    plans: {} as Record<string, { id: string }[]>,
  });
  useEffect(() => {
    let cancelled = false;
    if (planCache.current.landing !== landing) {
      planCache.current = { landing, plans: {} };
      setPublishedPlans({});
    }
    const visible: string[] = JSON.parse(displayedIds);
    const ids = visible.filter((id) => !planCache.current.plans[id]);
    const loadPlans = async () => {
      for (let start = 0; start < ids.length && !cancelled; start += 4) {
        const results = await Promise.allSettled(
          ids.slice(start, start + 4).map(async (id) => {
            const detail =
              await services.customerData.discoverOrganizationDetail(id);
            return [
              id,
              detail.membershipProducts.flatMap((product) =>
                product.plans.map(({ id }) => ({ id })),
              ),
            ] as const;
          }),
        );
        if (cancelled) return;
        planCache.current.plans = {
          ...planCache.current.plans,
          ...Object.fromEntries(
            results.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          ),
        };
        setPublishedPlans(planCache.current.plans);
      }
    };
    void loadPlans();
    return () => {
      cancelled = true;
    };
  }, [displayedIds, landing]);
  const estimateFor = (card: CardVM) =>
    code(card) === "ACTIVE"
      ? card.product.plans.find(
          (plan) => plan.id === card.subscription.subscriptionPlanId,
        )?.potentialSavings
      : undefined;
  const nameFor = (card: CardVM) =>
    [
      card.product.plans.find(
        (plan) => plan.id === card.subscription.subscriptionPlanId,
      )?.subscriptionPlanName,
      card.product.membershipProductName,
    ]
      .filter(Boolean)
      .join(" ");
  const openGroup = (group: OrgGroup) => {
    const selected =
      group.organizationId === currentOrganizationId
        ? group.cards.find(
            (card) => card.subscription.id === currentSubscriptionId,
          )
        : undefined;
    if (selected || group.cards.length === 1)
      openBusiness(selected ?? group.cards[0]);
    else if (mode !== "memberships")
      router.push("/customer/memberships" as never);
  };
  const heading = (title: string, count: number, route: string) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="h3">{title}</Text>
      <Badge
        label={count + (count === 1 ? " business" : " businesses")}
        tone="brand"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"View all " + title}
        onPress={() => router.push(route as never)}
        style={{
          marginLeft: "auto",
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
        }}
      >
        <Text variant="label" color="primary">
          View all
        </Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.primary}
        />
      </Pressable>
    </View>
  );

  const groupsView = (directory: boolean) =>
    owned.map((group) => {
      const cards = directory
        ? group.cards.filter(
            (card) => filter === "all" || code(card) === filter.toUpperCase(),
          )
        : group.cards;

      if (!cards.length) return null;

      const activeCount = group.cards.filter(
        (card) => code(card) === "ACTIVE",
      ).length;

      const discoveredBusiness = discoverable.find(
        (business) => business.organizationId === group.organizationId,
      );

      const logoUrl = group.logoUrl || discoveredBusiness?.logoUrl;

      // ALL MEMBERSHIPS — detailed, branded card layout
      if (directory) {
        return (
          <View
            key={group.organizationId}
            style={{
              width: "100%",
              gap: theme.spacing.md,
              marginBottom: theme.spacing.lg,
            }}
          >
            {/* Business heading — no oversized outer card */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Open " + group.organizationName}
              onPress={() => openDiscovery(group.organizationId)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
                paddingBottom: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              {discoveredBusiness ? (
                <DiscoveryImage business={discoveredBusiness} />
              ) : (
                <BusinessLogo
                  url={logoUrl}
                  organizationId={group.organizationId}
                  name={group.organizationName}
                />
              )}

              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="bodyStrong">{group.organizationName}</Text>
                <Text variant="caption" color="textSecondary">
                  {cards.length}{" "}
                  {cards.length === 1 ? "membership" : "memberships"}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textMuted}
              />
            </Pressable>

            {/* Detailed membership cards */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-start",
                gap: theme.spacing.md,
                width: "100%",
              }}
            >
              {cards.map((card) => {
                const status = code(card);
                const isActive = status === "ACTIVE";
                const estimate = estimateFor(card);
                const showEstimate =
                  isActive &&
                  card.product.plans.some(
                    (plan) => plan.id === card.subscription.subscriptionPlanId,
                  );

                return (
                  <Pressable
                    key={card.subscription.id}
                    accessibilityRole="button"
                    accessibilityLabel={"Open " + nameFor(card)}
                    onPress={() => openBusiness(card)}
                    style={{
                      width: width >= 700 ? "48%" : "100%",
                      flexGrow: width >= 700 ? 1 : 0,
                      flexShrink: 1,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: theme.colors.card,
                        borderRadius: theme.radius.lg,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        overflow: "hidden",
                        shadowColor: "#000",
                        shadowOpacity: 0.07,
                        shadowRadius: 10,
                        shadowOffset: {
                          width: 0,
                          height: 3,
                        },
                        elevation: 2,
                      }}
                    >
                      {/* Membership colour accent */}
                      <View
                        style={{
                          height: 5,
                          backgroundColor: group.theme.colors.primary,
                        }}
                      />

                      <View
                        style={{
                          padding: theme.spacing.lg,
                          gap: theme.spacing.lg,
                        }}
                      >
                        {/* Business identity and status */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: theme.spacing.sm,
                          }}
                        >
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            <BusinessLogo
                              url={logoUrl}
                              organizationId={group.organizationId}
                              name={group.organizationName}
                            />
                          </View>

                          <View
                            style={{
                              flex: 1,
                              minWidth: 0,
                              gap: 3,
                            }}
                          >
                            <Text variant="caption" color="textSecondary">
                              MEMBERSHIP
                            </Text>
                            <Text variant="bodyStrong" numberOfLines={1}>
                              {group.organizationName}
                            </Text>
                          </View>

                          <Badge
                            label={
                              card.subscriptionStatus?.statusName ??
                              status ??
                              "Unknown"
                            }
                            tone={isActive ? "success" : "neutral"}
                          />
                        </View>

                        {/* Prominent membership title */}
                        <View
                          style={{
                            gap: theme.spacing.sm,
                            minHeight: 75,
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: width >= 700 ? 25 : 24,
                              lineHeight: 31,
                              fontWeight: "700",
                              color: theme.colors.text,
                            }}
                            numberOfLines={2}
                          >
                            {nameFor(card)}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: theme.spacing.xs,
                            }}
                          >
                            <Ionicons
                              name="calendar-outline"
                              size={15}
                              color={theme.colors.textMuted}
                            />
                            <Text variant="caption" color="textSecondary">
                              {status === "EXPIRED" ? "Expired" : "Valid until"}{" "}
                              {formatDate(card.subscription.endDate)}
                            </Text>
                          </View>
                          {showEstimate && (
                            <Text variant="bodySmall" color="textSecondary">
                              {(estimate && potentialSavingsLabel(estimate)) ||
                                "Potential Savings · Estimate unavailable"}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }

      const estimate = cards.length === 1 ? estimateFor(cards[0]) : undefined;
      // CUSTOMER HOME — retain compact business summaries
      return (
        <Card
          key={group.organizationId}
          padding="md"
          style={{
            borderColor: theme.colors.borderStrong,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Open " + group.organizationName}
            onPress={() => openDiscovery(group.organizationId)}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.md,
              }}
            >
              {discoveredBusiness ? (
                <DiscoveryImage business={discoveredBusiness} />
              ) : (
                <BusinessLogo
                  url={logoUrl}
                  organizationId={group.organizationId}
                  name={group.organizationName}
                />
              )}

              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  gap: theme.spacing.xs,
                }}
              >
                <Text variant="bodyStrong">{group.organizationName}</Text>

                <Text variant="bodySmall" color="textSecondary">
                  {activeCount} active{" "}
                  {activeCount === 1 ? "membership" : "memberships"}
                </Text>
                {estimate && potentialSavingsLabel(estimate) ? (
                  <Text variant="caption" color="textSecondary">
                    {potentialSavingsLabel(estimate)}
                  </Text>
                ) : null}

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: theme.spacing.xs,
                  }}
                >
                  {cards.slice(0, 3).map((card) => (
                    <View key={card.subscription.id}>
                      <Badge label={nameFor(card)} tone="brand" />
                    </View>
                  ))}

                  {cards.length > 3 && (
                    <Badge label={"+" + (cards.length - 3)} />
                  )}
                </View>
              </View>

              <View
                style={{
                  alignItems: "center",
                  gap: theme.spacing.xs,
                }}
              >
                {activeCount > 0 && <Badge label="Active" tone="success" />}
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </View>
            </View>
          </Pressable>
        </Card>
      );
    });

  const businessView = (items: CustomerDiscoverableOrganization[]) =>
    items.length ? (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.md,
        }}
      >
        {items.map((business) => {
          const activePlanIds = activeMembershipPlanIds(
            owned
              .find((group) => group.organizationId === business.organizationId)
              ?.cards.map((card) => ({
                planId: card.subscription.subscriptionPlanId,
                status: code(card),
              })) ?? [],
          );
          const catalog = publishedPlans[business.organizationId];
          const action = discoveryMembershipAction(
            activePlanIds.size > 0,
            catalog &&
              discoverableMembershipPlans(catalog, activePlanIds).length > 0,
          );
          return (
            <View
              key={business.organizationId}
              style={{ width: width >= 700 ? "48%" : "100%", minWidth: 0 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  action + " at " + (business.displayName || business.name)
                }
                onPress={() =>
                  action === "View Business"
                    ? openDiscovery(business.organizationId)
                    : router.push(
                        APP_ROUTES.discover.memberships(
                          business.organizationId,
                        ) as never,
                      )
                }
              >
                <Card
                  padding="md"
                  style={{ borderColor: theme.colors.borderStrong }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.md,
                    }}
                  >
                    <DiscoveryImage business={business} />
                    <View
                      style={{ flex: 1, minWidth: 0, gap: theme.spacing.xs }}
                    >
                      <Text variant="bodyStrong">
                        {business.displayName || business.name}
                      </Text>
                      {business.tagline ? (
                        <Text
                          variant="bodySmall"
                          color="textSecondary"
                          numberOfLines={2}
                        >
                          {business.tagline}
                        </Text>
                      ) : null}
                      <View
                        style={{
                          alignSelf: "flex-start",
                          maxWidth: "100%",
                          backgroundColor: theme.colors.primarySoft,
                          borderRadius: theme.radius.pill,
                          paddingHorizontal: theme.spacing.sm,
                          paddingVertical: theme.spacing.xs,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          variant="label"
                          color="primary"
                          style={{ flexShrink: 1 }}
                        >
                          {action}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color={theme.colors.primary}
                        />
                      </View>
                    </View>
                  </View>
                </Card>
              </Pressable>
            </View>
          );
        })}
      </View>
    ) : (
      <Text color="textSecondary">
        {search.trim()
          ? "No businesses match your search."
          : "No businesses are available to explore right now."}
      </Text>
    );
  return (
    <Screen
      testID="customer-cards-screen"
      edges={["top"]}
      header={
        <Header
          title="Memgine"
          right={<CustomerNotificationBell />}
          testID="cards-header"
        />
      }
    >
      {customersLoading || loading ? (
        <StateView kind="loading" message={t("common.loading")} />
      ) : customersError || error ? (
        <StateView
          kind="error"
          title={t("common.error")}
          message={customersError || error || undefined}
          actionLabel={t("common.retry")}
          onAction={() => void refreshCustomers()}
        />
      ) : (
        <>
          {mode !== "home" && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                minHeight: 44,
              }}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={theme.colors.primary}
              />
              <Text variant="label" color="primary">
                {" "}
                Back
              </Text>
            </Pressable>
          )}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="h2">
              {mode === "home"
                ? "Welcome to Memgine"
                : mode === "memberships"
                  ? "All Memberships"
                  : "Discover Businesses"}
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              {mode === "home"
                ? "Your memberships, rewards and local businesses in one place."
                : mode === "memberships"
                  ? "Every membership you have, across all businesses."
                  : "Browse local businesses and explore their memberships."}
            </Text>
          </View>
          {mode !== "memberships" && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: theme.colors.card,
              }}
            >
              <Ionicons
                name="search-outline"
                size={20}
                color={theme.colors.textMuted}
              />
              <TextInput
                accessibilityLabel="Search for a business"
                placeholder="Search for a business"
                placeholderTextColor={theme.colors.textMuted}
                value={search}
                onChangeText={setSearch}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 48,
                  color: theme.colors.text,
                }}
              />
            </View>
          )}
          {mode === "home" && (
            <View style={{ gap: theme.spacing.md }}>
              {heading(
                "Your Memberships",
                owned.length,
                "/customer/memberships",
              )}
              {owned.length ? (
                groupsView(false)
              ) : (
                <Text color="textSecondary">
                  You don&apos;t have any memberships yet.
                </Text>
              )}
            </View>
          )}
          {mode === "memberships" && (
            <View style={{ gap: theme.spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: theme.spacing.sm,
                }}
              >
                {(["all", "active", "expired"] as const).map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === item }}
                    onPress={() => setFilter(item)}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <Badge
                      label={
                        item.charAt(0).toUpperCase() +
                        item.slice(1) +
                        " (" +
                        counts[item] +
                        ")"
                      }
                      tone={filter === item ? "brand" : "neutral"}
                    />
                  </Pressable>
                ))}
              </View>
              {counts[filter] ? (
                groupsView(true)
              ) : (
                <Text color="textSecondary">No memberships to show.</Text>
              )}
            </View>
          )}
          {mode !== "memberships" && (
            <View style={{ gap: theme.spacing.md }}>
              {mode === "home" &&
                heading(
                  "Discover Businesses",
                  discoverable.length,
                  "/customer/businesses",
                )}
              {businessView(displayedBusinesses)}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
