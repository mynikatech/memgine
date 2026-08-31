import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import { resolveCustomerBranding } from "@/src/core/customer/resolve-customer-branding";
import type {
  CardStyle,
  TemplateDefinition,
} from "@/src/core/template/template-definition";

import type {
  Benefit,
  CustomerExperienceDefinition,
  MembershipProduct,
  Offer,
  Organization,
  OrganizationDetails,
  Redemption,
  Store,
  Status,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";

import { services } from "@/src/core";
import { useBusiness, useTranslation } from "@/src/providers";
import { Badge, BrandLogo, Button, Card, Modal, Section, Text } from "@/src/ui";

import {
  ActivityItem,
  benefitIconForType,
  BenefitItem,
  MembershipCard,
  OfferCard,
  QrPlaceholder,
} from "@/src/ui/domain";

import { ExperienceTabKey, resolveExperience } from "./resolve-experience";

/**
 * Customer-facing sections which can be independently previewed by Org Admin.
 */
export type CustomerExperiencePreviewSection =
  | "membership"
  | "benefits"
  | "offers"
  | "stores"
  | "activity"
  | "business-information"
  | "business-preferences"
  | "referral"
  | "profile";

type Props = {
  content: TemplateDefaultContent;

  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;

  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];

  memberships: {
    subscription: Subscription;
    product: MembershipProduct;
  }[];

  selectedSubscriptionId: string;
  onSelectSubscription: (subscriptionId: string) => void;

  availableMemberships: MembershipProduct[];

  onJoin: (productId: string) => void;
  onExit: () => void;

  /**
   * Customer Experience definition used for preview.
   *
   * When omitted, the actual active BusinessConfiguration is used.
   */
  previewDefinition?: CustomerExperienceDefinition;

  /**
   * Optional organization override.
   *
   * Used by admin Current/Proposed preview so the same customer renderer
   * can render either the persisted organization or the proposed draft.
   */
  organizationOverride?: Organization;

  /**
   * Optional organization-details override.
   */
  detailsOverride?: OrganizationDetails | null;

  initialTab?: ExperienceTabKey;

  activeTab?: ExperienceTabKey;
  onTabChange?: (tab: ExperienceTabKey) => void;

  previewMode?: boolean;

  hideTabBar?: boolean;

  onPreviewTab?: (tab: ExperienceTabKey) => void;

  /**
   * When specified, only this customer-facing section is rendered.
   */
  previewSection?: CustomerExperiencePreviewSection;
};

export function BusinessExperience({
  content,
  subscription,
  subscriptionStatus,
  product,
  benefits,
  offers,
  stores,
  redemptions,
  memberships,
  selectedSubscriptionId,
  onSelectSubscription,
  availableMemberships,
  onJoin,
  onExit,
  previewDefinition,
  organizationOverride,
  detailsOverride,
  initialTab = "card",
  activeTab,
  onTabChange,
  previewMode = false,
  hideTabBar = false,
  onPreviewTab,
  previewSection,
}: Props) {
  const {
    organization: contextOrganization,
    configuration,
    template,
    theme,
  } = useBusiness();

  const { t, formatDate, formatMoney } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * The actual customer renderer can receive a proposed organization/details
   * while leaving the rest of the application context untouched.
   */
  const organization = organizationOverride ?? contextOrganization;

  /**
   * BusinessExperience's customer-facing business information is ultimately
   * resolved by resolveExperience().
   *
   * The details override is therefore supplied through the configuration
   * object used by the resolver where the resolver supports it.
   */
  const resolvedBranding = useMemo(
    () =>
      resolveCustomerBranding({
        organization,
        configuration,
        previewDefinition,
      }),
    [organization, configuration, previewDefinition],
  );

  const resolvedConfiguration = useMemo(
    () => ({
      ...configuration,

      identity: {
        ...configuration.identity,
        displayName: resolvedBranding.displayName,
      },
      branding: {
        ...configuration.branding,
        logoUrl:
          resolvedBranding.logoUrl ?? configuration.branding.logoUrl ?? "",
        darkThemeLogoUrl:
          resolvedBranding.darkThemeLogoUrl ??
          configuration.branding.darkThemeLogoUrl,
        faviconUrl:
          resolvedBranding.faviconUrl ?? configuration.branding.faviconUrl,
        splashScreenImageUrl:
          resolvedBranding.splashScreenImageUrl ??
          configuration.branding.splashScreenImageUrl,
        primaryColor:
          resolvedBranding.primaryColor ?? configuration.branding.primaryColor,
        secondaryColor:
          resolvedBranding.secondaryColor ??
          configuration.branding.secondaryColor,
        accentColor:
          resolvedBranding.accentColor ?? configuration.branding.accentColor,
      },
      customerExperience: {
        ...configuration.customerExperience,

        cardStyle:
          previewDefinition?.membership.cardStyle ??
          configuration.customerExperience.cardStyle,

        showOffers:
          previewDefinition?.sections.offers ??
          configuration.customerExperience.showOffers,

        showStores:
          previewDefinition?.sections.stores ??
          configuration.customerExperience.showStores,

        showActivity:
          previewDefinition?.sections.activity ??
          configuration.customerExperience.showActivity,
      },
    }),
    [configuration, resolvedBranding, previewDefinition],
  );

  const resolvedContent = previewDefinition?.content ?? content;

  const [tab, setTab] = useState<ExperienceTabKey>(initialTab);
  const [referralOpen, setReferralOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const effectiveTab = activeTab ?? tab;

  const handleTabChange = (nextTab: ExperienceTabKey) => {
    if (activeTab === undefined) {
      setTab(nextTab);
    }

    onTabChange?.(nextTab);
  };

  const exp = useMemo(
    () =>
      resolveExperience({
        organization,
        configuration: resolvedConfiguration,
        template,
        content: resolvedContent,
        subscription,
        subscriptionStatus,
        product,
        benefits,
        offers,
        stores,
        redemptions,
        formatDate,
        detailsOverride,
      }),
    [
      organization,
      resolvedConfiguration,
      template,
      resolvedContent,
      subscription,
      subscriptionStatus,
      product,
      benefits,
      offers,
      stores,
      redemptions,
      formatDate,
      detailsOverride,
    ],
  );

  const cardStyle: CardStyle =
    previewDefinition?.membership.cardStyle ??
    configuration.customerExperience.cardStyle;

  /* ------------------------------------------------------------------ */
  /* Redemption                                                         */
  /* ------------------------------------------------------------------ */

  type RedemptionToken = {
    token: string;
    customerId: string;
    organizationId: string;
    subscriptionId: string;
    benefitIds: string[];
    createdAt: string;
  };

  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(
    new Set(),
  );

  const [redeemToken, setRedeemToken] = useState<RedemptionToken | null>(null);

  useEffect(() => {
    setSelectedBenefitIds(
      new Set(
        exp.redeemableBenefits.filter((b) => b.available).map((b) => b.id),
      ),
    );

    setRedeemToken(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubscriptionId]);

  const toggleBenefit = (id: string) =>
    setSelectedBenefitIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const redeemSelected = async () => {
    if (!subscription || previewMode) return;

    const ids = exp.redeemableBenefits
      .filter((b) => b.available && selectedBenefitIds.has(b.id))
      .map((b) => b.id);

    if (!ids.length) return;

    const organizationUser = await services.organization.getOrganizationUser(
      subscription.organizationUserId,
    );

    if (!organizationUser) {
      return;
    }

    setRedeemToken({
      token: `RDM-${subscription.id
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`,
      customerId: organizationUser.userId,
      organizationId: organizationUser.organizationId,
      subscriptionId: subscription.id,
      benefitIds: ids,
      createdAt: new Date().toISOString(),
    });
  };

  const benefitTitleById = useMemo(
    () =>
      new Map(exp.benefits.map((b) => [b.id, b.displayName ?? b.benefitName])),
    [exp.benefits],
  );

  const selectedCount = exp.redeemableBenefits.filter(
    (b) => b.available && selectedBenefitIds.has(b.id),
  ).length;

  const hasRedeemable = exp.redeemableBenefits.some((b) => b.available);

  /* ------------------------------------------------------------------ */
  /* Sub-renderers                                                      */
  /* ------------------------------------------------------------------ */

  const HeroImage = ({
    uri,
    height = 168,
  }: {
    uri?: string;
    height?: number;
  }) =>
    uri ? (
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={{
          width: "100%",
          height,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      />
    ) : null;

  const renderPromotionCard = (
    promo: NonNullable<typeof exp.heroPromotion>,
  ) => (
    <Card padding="none" style={{ overflow: "hidden" }}>
      <HeroImage uri={promo.imageUrl} />

      <View
        style={{
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {promo.badge ? <Badge label={promo.badge} tone="brand" /> : <View />}

          {promo.expiryLabel ? (
            <Text variant="caption" color="textMuted">
              {promo.expiryLabel}
            </Text>
          ) : null}
        </View>

        <Text variant="h2" color="text">
          {promo.title}
        </Text>

        <Text variant="bodySmall" color="textSecondary">
          {promo.description}
        </Text>
      </View>
    </Card>
  );

  const planLabel = (p: MembershipProduct) => {
    const plan = p.plans[0];

    if (!plan) return "";

    const interval = getSubscriptionPeriodLabel(plan);

    return `${formatMoney(plan.price.amountMinor)} · ${interval}`;
  };

  const renderTabPreviewLink = (tabKey: ExperienceTabKey) => {
    if (!previewMode || !onPreviewTab || previewSection) {
      return null;
    }

    return (
      <Pressable
        onPress={() => onPreviewTab(tabKey)}
        accessibilityRole="link"
        hitSlop={6}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingVertical: 2,
          opacity: pressed ? theme.states.pressedOpacity : 1,
        })}
      >
        <Text
          variant="bodySmall"
          color="primary"
          style={{ textDecorationLine: "underline", fontWeight: "600" }}
        >
          Preview
        </Text>
      </Pressable>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Card                                                               */
  /* ------------------------------------------------------------------ */

  const CardTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-card">
      {renderTabPreviewLink("card")}

      {exp.heroPromotion ? renderPromotionCard(exp.heroPromotion) : null}

      {exp.membership ? (
        <Section title={t("experience.yourMemberships")}>
          <MembershipCard
            testID="experience-membership-card"
            organizationName={exp.displayName}
            tier={exp.membership.tier}
            validUntil={exp.membership.validUntilLabel}
            active={exp.membership.active}
            cardStyle={cardStyle}
          />
        </Section>
      ) : previewMode ? (
        <Section title={t("experience.yourMemberships")}>
          <MembershipCard
            testID="experience-preview-membership-card"
            organizationName={exp.displayName}
            tier={
              previewDefinition?.membership.headline ??
              content.membership.tierName ??
              "Membership"
            }
            validUntil="—"
            active={previewDefinition?.membership.enabled ?? true}
            cardStyle={cardStyle}
          />
        </Section>
      ) : null}

      {exp.membership && exp.benefits.length ? (
        <Section title={t("experience.yourBenefits")}>
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.benefits.map((b) => (
                <BenefitItem
                  key={b.id}
                  testID={`experience-benefit-${b.id}`}
                  title={b.displayName ?? b.benefitName}
                  subtitle={b.description}
                  icon={benefitIconForType(b.benefitTypeId)}
                />
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {exp.membership?.active && exp.redeemableBenefits.length ? (
        <Section title={t("experience.redeemBenefits")}>
          <Card padding="lg" testID="experience-redeem-benefits">
            <View style={{ gap: 14 }}>
              {exp.redeemableBenefits.map((b) => {
                const selected = b.available && selectedBenefitIds.has(b.id);

                return (
                  <Pressable
                    key={b.id}
                    testID={`experience-redeem-benefit-${b.id}`}
                    disabled={!b.available || previewMode}
                    onPress={() => toggleBenefit(b.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.md,
                      opacity: !b.available
                        ? 0.5
                        : pressed
                          ? theme.states.pressedOpacity
                          : 1,
                    })}
                  >
                    <Ionicons
                      name={
                        !b.available
                          ? "ban-outline"
                          : selected
                            ? "checkbox"
                            : "square-outline"
                      }
                      size={22}
                      color={
                        !b.available || !selected
                          ? theme.colors.textMuted
                          : theme.colors.primary
                      }
                    />

                    <View style={{ flex: 1 }}>
                      <Text
                        variant="bodyStrong"
                        color={b.available ? "text" : "textMuted"}
                      >
                        {b.displayName ?? b.benefitName}
                      </Text>

                      {b.description ? (
                        <Text variant="bodySmall" color="textMuted">
                          {b.description}
                        </Text>
                      ) : null}
                    </View>

                    {!b.available ? (
                      <Badge
                        label={t("experience.benefitUsed")}
                        tone="neutral"
                      />
                    ) : null}
                  </Pressable>
                );
              })}

              {!hasRedeemable ? (
                <Text variant="bodySmall" color="textMuted">
                  {t("experience.noRedeemable")}
                </Text>
              ) : null}

              {!previewMode ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: theme.spacing.sm,
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    {t("experience.selectedCount", {
                      count: selectedCount,
                    })}
                  </Text>

                  <Button
                    label={t("experience.redeemSelected")}
                    disabled={selectedCount === 0}
                    onPress={() => {
                      void redeemSelected();
                    }}
                    testID="experience-redeem-selected"
                  />
                </View>
              ) : null}
            </View>
          </Card>
        </Section>
      ) : null}

      {!previewMode && availableMemberships.length ? (
        <Section title={t("experience.availableMemberships")}>
          <View style={{ gap: theme.spacing.md }}>
            {availableMemberships.map((p) => (
              <Card
                key={p.id}
                testID={`experience-available-${p.id}`}
                padding="lg"
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      gap: 2,
                    }}
                  >
                    <Text variant="bodyStrong" color="text">
                      {p.displayName ?? p.membershipProductName}
                    </Text>

                    {p.description ? (
                      <Text variant="bodySmall" color="textMuted">
                        {p.description}
                      </Text>
                    ) : null}

                    <Text variant="bodySmall" color="primary">
                      {planLabel(p)}
                    </Text>
                  </View>

                  <Button
                    label={t("experience.join")}
                    size="sm"
                    onPress={() => onJoin(p.id)}
                    testID={`experience-join-${p.id}`}
                  />
                </View>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );

  /* ------------------------------------------------------------------ */
  /* Offers                                                             */
  /* ------------------------------------------------------------------ */

  const OffersTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-offers">
      {renderTabPreviewLink("offers")}

      <Section title={t("experience.todaysPerks")}>
        {exp.featuredPromotion
          ? renderPromotionCard(exp.featuredPromotion)
          : null}

        <View
          style={{
            gap: theme.spacing.md,
            marginTop: exp.featuredPromotion ? theme.spacing.md : 0,
          }}
        >
          {exp.offers.map((o) => (
            <OfferCard
              key={o.id}
              testID={`experience-offer-${o.id}`}
              title={o.offerName}
              description={o.description}
            />
          ))}

          {!exp.offers.length ? (
            <Card padding="lg">
              <Text variant="bodySmall" color="textMuted">
                No offers are currently available.
              </Text>
            </Card>
          ) : null}
        </View>
      </Section>
    </View>
  );

  /* ------------------------------------------------------------------ */
  /* History                                                            */
  /* ------------------------------------------------------------------ */

  const HistoryTab = (() => {
    const sortedActivity = [...exp.activity].sort((a, b) => {
      const redemptionA = redemptions.find((r) => r.id === a.id);
      const redemptionB = redemptions.find((r) => r.id === b.id);

      const timeA = redemptionA
        ? new Date(redemptionA.redemptionDateTime).getTime()
        : 0;

      const timeB = redemptionB
        ? new Date(redemptionB.redemptionDateTime).getTime()
        : 0;

      return timeB - timeA;
    });

    const visibleActivity = showAllHistory
      ? sortedActivity
      : sortedActivity.slice(0, 3);

    const currentYear = new Date().getFullYear();

    const redemptionsThisYear = redemptions.filter(
      (redemption) =>
        new Date(redemption.redemptionDateTime).getFullYear() === currentYear,
    ).length;

    const latestRedemption = [...redemptions].sort(
      (a, b) =>
        new Date(b.redemptionDateTime).getTime() -
        new Date(a.redemptionDateTime).getTime(),
    )[0];

    const calendarBaseDate = latestRedemption
      ? new Date(latestRedemption.redemptionDateTime)
      : new Date();

    const calendarYear = calendarBaseDate.getFullYear();
    const calendarMonth = calendarBaseDate.getMonth();

    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const calendarCells: Array<{
      date: Date;
      day: number;
      currentMonth: boolean;
    }> = [];

    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      const date = new Date(calendarYear, calendarMonth, -i);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(calendarYear, calendarMonth, day);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: true,
      });
    }

    let nextDay = 1;

    while (calendarCells.length % 7 !== 0) {
      const date = new Date(calendarYear, calendarMonth + 1, nextDay);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: false,
      });

      nextDay += 1;
    }

    const redemptionDates = new Set(
      redemptions.map((r) => {
        const date = new Date(r.redemptionDateTime);

        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }),
    );

    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const storeCounts = new Map<string, number>();

    redemptions.forEach((redemption) => {
      storeCounts.set(
        redemption.storeId,
        (storeCounts.get(redemption.storeId) ?? 0) + 1,
      );
    });

    let mostVisitedStore = exp.mostVisited;

    if (storeCounts.size) {
      let highestCount = 0;
      let highestStoreId: string | undefined;

      storeCounts.forEach((count, storeId) => {
        if (count > highestCount) {
          highestCount = count;
          highestStoreId = storeId;
        }
      });

      if (highestStoreId) {
        mostVisitedStore =
          exp.stores.find((store) => store.id === highestStoreId)?.name ??
          exp.mostVisited;
      }
    }

    const benefitCounts = new Map<string, number>();

    redemptions.forEach((redemption) => {
      benefitCounts.set(
        redemption.benefitId,
        (benefitCounts.get(redemption.benefitId) ?? 0) + 1,
      );
    });

    let topBenefit: string | undefined;

    if (benefitCounts.size) {
      let highestCount = 0;
      let highestBenefitId: string | undefined;

      benefitCounts.forEach((count, benefitId) => {
        if (count > highestCount) {
          highestCount = count;
          highestBenefitId = benefitId;
        }
      });

      if (highestBenefitId) {
        topBenefit = benefitTitleById.get(highestBenefitId);
      }
    }

    const monthLabel = calendarBaseDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

    return (
      <View style={{ gap: theme.spacing.lg }} testID="experience-tab-history">
        {renderTabPreviewLink("history")}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="h2" color="text">
            {t("experience.tabHistory")}
          </Text>

          {sortedActivity.length > 3 ? (
            <Pressable
              onPress={() => setShowAllHistory((current) => !current)}
              hitSlop={8}
            >
              <Text variant="label" color="primary">
                {showAllHistory ? "Show Less" : "View All"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Card
          padding="lg"
          testID="experience-history-summary"
          style={{
            overflow: "hidden",
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.xs,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: theme.spacing.xs,
              }}
            >
              <Ionicons
                name="gift-outline"
                size={34}
                color={theme.colors.primary}
              />
            </View>

            <Text variant="title" color="text">
              Redeemed
            </Text>

            <Text
              variant="display"
              color="primary"
              style={{
                fontSize: 44,
                lineHeight: 50,
                fontWeight: "600",
              }}
            >
              {redemptionsThisYear}
            </Text>

            <Text
              variant="caption"
              color="textMuted"
              style={{
                letterSpacing: 1.5,
                fontWeight: "600",
              }}
            >
              REWARDS THIS YEAR
            </Text>

            <Text
              variant="bodySmall"
              color="textSecondary"
              style={{
                textAlign: "center",
                marginTop: theme.spacing.sm,
              }}
            >
              Your membership activity at {exp.displayName}
            </Text>
          </View>
        </Card>

        {visibleActivity.length ? (
          <Section title="Recent Activity">
            <View style={{ gap: theme.spacing.md }}>
              {visibleActivity.map((activity) => {
                const redemption = redemptions.find(
                  (r) => r.id === activity.id,
                );

                const benefit = redemption
                  ? exp.benefits.find((b) => b.id === redemption.benefitId)
                  : undefined;

                const iconName = benefit
                  ? benefitIconForType(benefit.benefitTypeId)
                  : "gift-outline";

                return (
                  <Card
                    key={activity.id}
                    padding="md"
                    testID={`experience-activity-${activity.id}`}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.colors.primarySoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name={iconName as keyof typeof Ionicons.glyphMap}
                          size={27}
                          color={theme.colors.primary}
                        />
                      </View>

                      <View
                        style={{
                          flex: 1,
                          gap: 2,
                        }}
                      >
                        <Text
                          variant="bodyStrong"
                          color="text"
                          numberOfLines={2}
                        >
                          {activity.title}
                        </Text>

                        <Text
                          variant="bodySmall"
                          color="textSecondary"
                          numberOfLines={1}
                        >
                          {activity.location}
                        </Text>

                        <Text variant="caption" color="textMuted">
                          {activity.timeLabel}
                        </Text>
                      </View>

                      <View
                        style={{
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Text
                          variant="caption"
                          color="primary"
                          style={{
                            fontWeight: "600",
                            letterSpacing: 0.5,
                          }}
                        >
                          {t("experience.redeemed").toUpperCase()}
                        </Text>

                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: theme.colors.primary,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={15}
                            color={theme.colors.onPrimary}
                          />
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          </Section>
        ) : (
          <Card
            padding="lg"
            style={{
              alignItems: "center",
              paddingVertical: 32,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: theme.spacing.sm,
              }}
            >
              <Ionicons
                name="time-outline"
                size={28}
                color={theme.colors.primary}
              />
            </View>

            <Text variant="bodyStrong" color="text">
              {t("experience.tabHistory")}
            </Text>

            <Text
              variant="bodySmall"
              color="textMuted"
              style={{
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {t("experience.historyEmpty")}
            </Text>
          </Card>
        )}

        <Card
          padding="lg"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <View style={{ gap: theme.spacing.lg }}>
            <View>
              <Text variant="h2" color="text">
                Activity
              </Text>

              <Text
                variant="caption"
                color="textMuted"
                style={{ marginTop: 3 }}
              >
                {monthLabel}
              </Text>
            </View>

            <View style={{ flexDirection: "row" }}>
              {weekdayLabels.map((label, index) => (
                <View
                  key={`${label}-${index}`}
                  style={{
                    flex: 1,
                    alignItems: "center",
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ gap: 8 }}>
              {Array.from({
                length: Math.ceil(calendarCells.length / 7),
              }).map((_, weekIndex) => (
                <View
                  key={`week-${weekIndex}`}
                  style={{
                    flexDirection: "row",
                  }}
                >
                  {calendarCells
                    .slice(weekIndex * 7, weekIndex * 7 + 7)
                    .map((cell) => {
                      const hasActivity = redemptionDates.has(
                        dateKey(cell.date),
                      );

                      const isLatest = latestRedemption
                        ? dateKey(
                            new Date(latestRedemption.redemptionDateTime),
                          ) === dateKey(cell.date)
                        : false;

                      return (
                        <View
                          key={dateKey(cell.date)}
                          style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: hasActivity
                                ? theme.colors.primarySoft
                                : "transparent",
                              borderWidth: isLatest ? 1.5 : 0,
                              borderColor: theme.colors.primary,
                            }}
                          >
                            <Text
                              variant="caption"
                              color={
                                !cell.currentMonth
                                  ? "textMuted"
                                  : hasActivity
                                    ? "primary"
                                    : "text"
                              }
                              style={{
                                opacity: cell.currentMonth ? 1 : 0.35,
                                fontWeight: hasActivity ? "600" : "400",
                              }}
                            >
                              {cell.day}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              ))}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: theme.colors.primarySoft,
                }}
              />

              <Text variant="caption" color="textMuted">
                Redemption activity
              </Text>
            </View>
          </View>
        </Card>

        {mostVisitedStore || topBenefit ? (
          <View style={{ gap: theme.spacing.sm }}>
            {mostVisitedStore ? (
              <Card
                padding="md"
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: theme.colors.primarySoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="star-outline"
                      size={18}
                      color={theme.colors.primary}
                    />
                  </View>

                  <Text variant="bodySmall" color="text" style={{ flex: 1 }}>
                    Most Visited
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    numberOfLines={1}
                  >
                    {mostVisitedStore}
                  </Text>
                </View>
              </Card>
            ) : null}

            {topBenefit ? (
              <Card
                padding="md"
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: theme.colors.primarySoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="heart-outline"
                      size={18}
                      color={theme.colors.primary}
                    />
                  </View>

                  <Text variant="bodySmall" color="text" style={{ flex: 1 }}>
                    Top Benefit
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    numberOfLines={1}
                    style={{
                      maxWidth: "55%",
                      textAlign: "right",
                    }}
                  >
                    {topBenefit}
                  </Text>
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  })();

  /* ------------------------------------------------------------------ */
  /* Business information                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The customer-facing Business Information section is rendered in one
   * place and reused by both the real Profile tab and the Org Admin
   * individual-section preview. This prevents the admin preview from
   * drifting away from the actual customer experience.
   */
  const BusinessInformationSection = exp.businessInformation ? (
    <Section title={t("experience.about")}>
      <Card padding="lg">
        <View style={{ gap: theme.spacing.md }}>
          {exp.businessInformation.about ? (
            <Text variant="body" color="textSecondary">
              {exp.businessInformation.about}
            </Text>
          ) : null}

          {exp.businessInformation.supportEmail ? (
            <InfoRow
              icon="mail-outline"
              label={t("experience.email")}
              value={exp.businessInformation.supportEmail}
              theme={theme}
            />
          ) : null}

          {exp.businessInformation.supportPhone ? (
            <InfoRow
              icon="call-outline"
              label={t("experience.phone")}
              value={exp.businessInformation.supportPhone}
              theme={theme}
            />
          ) : null}

          {exp.businessInformation.website ? (
            <InfoRow
              icon="globe-outline"
              label={t("experience.website")}
              value={exp.businessInformation.website}
              theme={theme}
            />
          ) : null}
        </View>
      </Card>
    </Section>
  ) : null;

  /* ------------------------------------------------------------------ */
  /* Profile                                                            */
  /* ------------------------------------------------------------------ */

  const ProfileTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-profile">
      {renderTabPreviewLink("profile")}

      {exp.showStores && exp.stores.length ? (
        <Section title={t("experience.locations")}>
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.stores.map((s) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={20}
                    color={theme.colors.primary}
                  />

                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" color="text">
                      {s.name}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {s.address.line1}
                      {s.address.city ? `, ${s.address.city}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {BusinessInformationSection}

      {exp.businessPreferences ? (
        <Section title={t("experience.preferences")}>
          <Card padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <PrefRow
                label={t("experience.notifications")}
                on={exp.businessPreferences.notifications}
                t={t}
                theme={theme}
              />

              <PrefRow
                label={t("experience.marketingEmails")}
                on={exp.businessPreferences.marketingEmails}
                t={t}
                theme={theme}
              />
            </View>
          </Card>
        </Section>
      ) : null}

      {exp.referral ? (
        <Card padding="lg">
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title" color="text">
              {exp.referral.headline}
            </Text>

            <Text variant="bodySmall" color="textMuted">
              {exp.referral.description}
            </Text>

            <Button
              label={t("experience.referral")}
              variant="secondary"
              onPress={() => setReferralOpen(true)}
              testID="experience-referral"
            />
          </View>
        </Card>
      ) : null}
    </View>
  );

  const tabContent =
    effectiveTab === "card"
      ? CardTab
      : effectiveTab === "offers"
        ? OffersTab
        : effectiveTab === "history"
          ? HistoryTab
          : ProfileTab;

  /* ------------------------------------------------------------------ */
  /* Individual section preview                                         */
  /* ------------------------------------------------------------------ */

  const individualSectionContent = (() => {
    switch (previewSection) {
      case "membership":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-membership"
          >
            <Section title={t("experience.yourMemberships")}>
              <MembershipCard
                testID="experience-preview-membership-card"
                organizationName={exp.displayName}
                tier={
                  exp.membership?.tier ??
                  previewDefinition?.membership.headline ??
                  resolvedContent.membership.tierName ??
                  "Membership"
                }
                validUntil={exp.membership?.validUntilLabel ?? "—"}
                active={
                  exp.membership?.active ??
                  previewDefinition?.membership.enabled ??
                  true
                }
                cardStyle={cardStyle}
              />
            </Section>
          </View>
        );

      case "benefits":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-benefits"
          >
            <Section title={t("experience.yourBenefits")}>
              {exp.benefits.length ? (
                <Card padding="lg">
                  <View style={{ gap: 18 }}>
                    {exp.benefits.map((b) => (
                      <BenefitItem
                        key={b.id}
                        testID={`experience-preview-benefit-${b.id}`}
                        title={b.displayName ?? b.benefitName}
                        subtitle={b.description}
                        icon={benefitIconForType(b.benefitTypeId)}
                      />
                    ))}
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    No membership benefits are currently configured.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "offers":
        return OffersTab;

      case "activity":
        return HistoryTab;

      case "stores":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-stores"
          >
            <Section title={t("experience.locations")}>
              {exp.stores.length ? (
                <Card padding="lg">
                  <View style={{ gap: 18 }}>
                    {exp.stores.map((s) => (
                      <View
                        key={s.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.md,
                        }}
                      >
                        <Ionicons
                          name="location-outline"
                          size={20}
                          color={theme.colors.primary}
                        />

                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong" color="text">
                            {s.name}
                          </Text>

                          <Text variant="bodySmall" color="textMuted">
                            {s.address.line1}
                            {s.address.city ? `, ${s.address.city}` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    No store locations are currently configured.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "business-information":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-business-information"
          >
            {BusinessInformationSection ?? (
              <Card padding="lg">
                <Text variant="bodySmall" color="textMuted">
                  Business information is not configured for this template.
                </Text>
              </Card>
            )}
          </View>
        );

      case "business-preferences":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-business-preferences"
          >
            <Section title={t("experience.preferences")}>
              {exp.businessPreferences ? (
                <Card padding="lg">
                  <View style={{ gap: theme.spacing.md }}>
                    <PrefRow
                      label={t("experience.notifications")}
                      on={exp.businessPreferences.notifications}
                      t={t}
                      theme={theme}
                    />

                    <PrefRow
                      label={t("experience.marketingEmails")}
                      on={exp.businessPreferences.marketingEmails}
                      t={t}
                      theme={theme}
                    />
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    Business preferences are not configured for this template.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "referral":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-referral"
          >
            <Section title={t("experience.referral")}>
              {exp.referral ? (
                <Card padding="lg">
                  <View style={{ gap: theme.spacing.sm }}>
                    <Text variant="title" color="text">
                      {exp.referral.headline}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {exp.referral.description}
                    </Text>

                    <Button
                      label={t("experience.referral")}
                      variant="secondary"
                      onPress={() => setReferralOpen(true)}
                      testID="experience-preview-referral"
                      disabled={previewMode}
                    />
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    Referral is not configured for this template.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "profile":
        return ProfileTab;

      default:
        return null;
    }
  })();

  const renderedContent = previewSection
    ? individualSectionContent
    : tabContent;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
      }}
    >
      {previewMode ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
          }}
        >
          <Pressable
            onPress={onExit}
            testID="experience-back"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: "flex-start",
              paddingVertical: 6,
              opacity: pressed ? theme.states.pressedOpacity : 1,
            })}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={theme.colors.primary}
            />

            <Text variant="label" color="primary">
              {t("experience.back")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <BrandLogo
          logoUrl={resolvedConfiguration.branding.logoUrl}
          monogram={exp.monogram}
          size={46}
          testID="experience-brand-logo"
        />

        <View style={{ flex: 1 }}>
          <Text variant="h2" color="text">
            {exp.displayName}
          </Text>

          <Text variant="caption" color="textMuted">
            {exp.tagline}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {memberships.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              gap: theme.spacing.sm,
            }}
            testID="experience-membership-selector"
          >
            {memberships.map((m) => {
              const selected = m.subscription.id === selectedSubscriptionId;

              const label =
                m.product.displayName ?? m.product.membershipProductName;

              return (
                <Pressable
                  key={m.subscription.id}
                  testID={`experience-membership-option-${m.subscription.id}`}
                  onPress={() => onSelectSubscription(m.subscription.id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 8,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                    backgroundColor: selected
                      ? theme.colors.primarySoft
                      : theme.colors.background,
                    opacity: pressed ? theme.states.pressedOpacity : 1,
                  })}
                >
                  <Ionicons
                    name={selected ? "card" : "card-outline"}
                    size={14}
                    color={
                      selected ? theme.colors.primary : theme.colors.textMuted
                    }
                  />

                  <Text
                    variant="label"
                    color={selected ? "primary" : "textMuted"}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {renderedContent}
      </ScrollView>

      {!hideTabBar ? (
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            paddingBottom: insets.bottom,
          }}
        >
          {exp.tabs.map((tb) => {
            const focused = tb.key === effectiveTab;

            return (
              <Pressable
                key={tb.key}
                testID={`experience-tabbar-${tb.key}`}
                onPress={() => handleTabChange(tb.key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 10,
                  gap: 2,
                }}
              >
                <Ionicons
                  name={
                    (focused
                      ? tb.icon
                      : tb.iconOutline) as keyof typeof Ionicons.glyphMap
                  }
                  size={22}
                  color={
                    focused ? theme.colors.primary : theme.colors.textMuted
                  }
                />

                <Text
                  variant="caption"
                  color={focused ? "primary" : "textMuted"}
                >
                  {t(tb.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!previewMode ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text variant="caption" color="textMuted">
            {t("experience.poweredBy")}
          </Text>
        </View>
      ) : null}

      <Modal
        visible={referralOpen}
        onClose={() => setReferralOpen(false)}
        title={exp.referral?.headline ?? t("experience.referral")}
        testID="experience-referral-modal"
      >
        {exp.referral ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="body" color="textSecondary">
              {exp.referral.description}
            </Text>

            <View
              style={{
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text variant="caption" color="textMuted">
                {t("experience.referralCode")}
              </Text>

              <Badge label={exp.referral.code} tone="brand" />
            </View>

            <Text
              variant="bodySmall"
              color="primary"
              style={{ textAlign: "center" }}
            >
              {exp.referral.rewardLabel}
            </Text>
          </View>
        ) : null}
      </Modal>

      {!previewMode ? (
        <Modal
          visible={!!redeemToken}
          onClose={() => setRedeemToken(null)}
          title={t("experience.redeemBenefits")}
          testID="experience-redeem-token-modal"
        >
          {redeemToken ? (
            <View
              style={{
                alignItems: "center",
                gap: theme.spacing.md,
              }}
            >
              <QrPlaceholder size={200} />

              <View style={{ alignItems: "center" }}>
                <Text variant="caption" color="textMuted">
                  {t("experience.redemptionCode")}
                </Text>

                <Text variant="title" color="text">
                  {redeemToken.token}
                </Text>
              </View>

              <View
                style={{
                  alignSelf: "stretch",
                  gap: 6,
                }}
              >
                {redeemToken.benefitIds.map((id) => (
                  <View
                    key={id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.colors.primary}
                    />

                    <Text variant="bodySmall" color="text">
                      {benefitTitleById.get(id) ?? id}
                    </Text>
                  </View>
                ))}
              </View>

              <Text variant="caption" color="textMuted">
                {t("experience.benefitsCount", {
                  count: redeemToken.benefitIds.length,
                })}
              </Text>

              <Text
                variant="bodySmall"
                color="textMuted"
                style={{
                  textAlign: "center",
                }}
              >
                {t("experience.redeemTokenHint")}
              </Text>
            </View>
          ) : null}
        </Modal>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function InfoRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  theme: ReturnType<typeof useBusiness>["theme"];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />

      <View style={{ flex: 1 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>

        <Text variant="bodySmall" color="text">
          {value}
        </Text>
      </View>
    </View>
  );
}

function PrefRow({
  label,
  on,
  t,
  theme,
}: {
  label: string;
  on: boolean;
  t: (path: string) => string;
  theme: ReturnType<typeof useBusiness>["theme"];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text variant="bodySmall" color="text">
        {label}
      </Text>

      <View
        style={{
          backgroundColor: on
            ? theme.colors.successSoft
            : theme.colors.surfaceAlt,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: theme.radius.pill,
        }}
      >
        <Text variant="caption" color={on ? "success" : "textMuted"}>
          {on ? t("experience.on") : t("experience.off")}
        </Text>
      </View>
    </View>
  );
}
