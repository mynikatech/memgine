import { useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useRef, useState } from "react";

import { Linking, Platform, Pressable, View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Subscription,
  Status as DomainStatus,
} from "@/src/core";

import { RedemptionMethod, services } from "@/src/core";

import type { TemplateDefinition } from "@/src/core/template/template-definition";

import {
  activeMembershipPlanIds,
  discoverableMembershipProducts,
  resolveOwnedMembershipProduct,
} from "@/src/core/domain/membership-helpers";

import type {
  CustomerCombinedOffer,
  CustomerDiscoveryDetail,
  CustomerRedemptionItemStatus,
} from "@/src/data/api/customer-data-api";

import type { CounterSubscription } from "@/src/data/api/counter-api";

import type { OrgAdminRedemption } from "@/src/data/api/org-admin-transaction-api";

import { APP_ROUTES } from "@/src/constants/navigation";

import { BusinessExperience } from "@/src/experience";

import {
  BusinessProvider,
  LocalizationProvider,
  useAuth,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";

import { Button, StateView, Text } from "@/src/ui";

type LoadStatus = "loading" | "error" | "ready";

type MembershipBundle = {
  subscription: Subscription;

  subscriptionStatus: DomainStatus;

  product: MembershipProduct;

  benefits: Benefit[];

  redemptions: Redemption[];

  redemptionItemStatuses: CustomerRedemptionItemStatus[];
};

const androidInstallUrl = process.env.EXPO_PUBLIC_ANDROID_INSTALL_URL?.trim();
const iosInstallUrl = process.env.EXPO_PUBLIC_IOS_INSTALL_URL?.trim();

type InstallPlatform = "ios" | "android" | "desktop";

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") {
    return "desktop";
  }

  const ua = navigator.userAgent || "";

  // iPhone, iPad and iPod.
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "ios";
  }

  // iPadOS may identify itself as Macintosh.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
    return "ios";
  }

  if (/Android/i.test(ua)) {
    return "android";
  }

  return "desktop";
}

function AppInstallSection() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);

  const [installPlatform, setInstallPlatform] =
    useState<InstallPlatform>("desktop");

  useEffect(() => {
    if (Platform.OS !== "web") return;

    setInstallPlatform(detectInstallPlatform());
  }, []);

  const showAndroid =
    installPlatform === "android" || installPlatform === "desktop";

  const showIos = installPlatform === "ios" || installPlatform === "desktop";

  useEffect(() => {
    if (Platform.OS !== "web") return;

    try {
      const saved = window.sessionStorage.getItem(
        "memgine-app-install-expanded",
      );

      if (saved === "false") {
        setExpanded(false);
      }
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }, []);

  if (Platform.OS !== "web" || (!androidInstallUrl && !iosInstallUrl)) {
    return null;
  }

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);

    try {
      window.sessionStorage.setItem(
        "memgine-app-install-expanded",
        String(next),
      );
    } catch {
      // The banner remains usable without session storage.
    }
  };

  return (
    <View
      testID="discover-app-install"
      style={{
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: 16,
        paddingTop: expanded ? 10 : 6,
        paddingBottom: expanded ? 12 : 6,
      }}
    >
      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? "Collapse Get the Memgine app"
            : "Expand Get the Memgine app"
        }
        accessibilityState={{ expanded }}
        testID="discover-app-install-toggle"
        style={{
          minHeight: 36,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text variant="bodyStrong" color="text">
          Get the Memgine app
        </Text>

        <Text variant="bodyStrong" color="primary">
          {expanded ? "Hide  ⌄" : "Show  ⌃"}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 10, paddingTop: 8 }}>
          <Text variant="bodySmall" color="textSecondary">
            You can continue on the web or install the app for future visits.
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {showAndroid && androidInstallUrl ? (
              <Button
                label="Get it on Google Play"
                size="sm"
                variant="outline"
                onPress={() => void Linking.openURL(androidInstallUrl)}
              />
            ) : null}

            {showIos && iosInstallUrl ? (
              <Button
                label="Get it on the App Store"
                size="sm"
                variant="outline"
                onPress={() => void Linking.openURL(iosInstallUrl)}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function subscriptionFromProtectedRow(row: CounterSubscription): Subscription {
  return {
    id: row.id,

    subscriptionNumber: row.subscriptionNumber,

    subscriptionPlanId: row.subscriptionPlanId,

    organizationUserId: row.organizationUserId,

    subscriptionDate: row.subscriptionDate,

    startDate: row.startDate,

    endDate: row.endDate,

    subscriptionStatusId: row.subscriptionStatusId,

    totalAmount: {
      amountMinor: Math.round(row.totalAmount * 100),

      currency: row.currencyCode as Subscription["totalAmount"]["currency"],
    },

    createdAt: row.createdAt,

    createdBy: row.userId,

    updatedAt: row.createdAt,

    updatedBy: row.userId,

    isDeleted: false,

    versionNo: 1,
  };
}

function redemptionFromProtectedRow(row: OrgAdminRedemption): Redemption {
  return {
    id: row.id,

    redemptionNumber: row.redemptionNumber,

    subscriptionId: row.subscriptionId,

    benefitId: row.benefitId,

    storeId: row.storeId,

    staffId: row.staffId ?? undefined,

    method: RedemptionMethod.QR,

    redemptionDateTime: row.redemptionDateTime,

    quantity: row.quantity,

    redemptionStatusId: row.redemptionStatusId,

    remarks: row.remarks ?? undefined,

    createdAt: row.createdAt,

    createdBy: row.createdBy,

    updatedAt: row.createdAt,

    updatedBy: row.createdBy,

    versionNo: 1,

    isDeleted: false,
  };
}

/**
 * Customer-public discovery must render inside a BusinessProvider because
 * BusinessExperience consumes the active business context.
 *
 * Discovery itself still does not change the customer's active
 * business/workspace.
 */
export default function DiscoverGateway() {
  const router = useRouter();
  const auth = useAuth();

  const { organizationId, productId, planId, section } = useLocalSearchParams<{
    organizationId: string;
    productId?: string;
    planId?: string;
    section?: string;
  }>();

  const [exploreAsGuest, setExploreAsGuest] = useState(false);

  if (!organizationId) {
    return null;
  }

  if (auth.loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text variant="body">Opening Memgine…</Text>
      </View>
    );
  }

  // A logged-out visitor must be able to choose between
  // signing into an existing Memgine account and exploring
  // memberships as a new customer.
  //
  // Never determine account existence from the QR code.
  if (!auth.session && !exploreAsGuest) {
    return (
      <View
        testID="discover-customer-entry"
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          gap: 20,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text variant="title">Welcome to Memgine</Text>

          <Text variant="body" color="textMuted">
            Discover memberships and exclusive offers from this business.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text variant="bodyStrong">Already a Memgine customer?</Text>

          <Button
            label="Sign in to Memgine"
            testID="discover-existing-customer-login"
            onPress={() => {
              // Preserve the exact business and relevant
              // membership navigation parameters.
              const query = [
                productId ? `productId=${encodeURIComponent(productId)}` : null,
                planId ? `planId=${encodeURIComponent(planId)}` : null,
                section ? `section=${encodeURIComponent(section)}` : null,
              ]
                .filter(Boolean)
                .join("&");

              const returnTo =
                `/discover/${encodeURIComponent(organizationId)}` +
                (query ? `?${query}` : "");

              router.push({
                pathname: APP_ROUTES.customerLogin,
                params: { returnTo },
              } as never);
            }}
          />

          <Text variant="bodySmall" color="textMuted">
            New to Memgine?
          </Text>

          <Button
            label="Explore Memberships"
            variant="outline"
            testID="discover-new-customer-explore"
            onPress={() => setExploreAsGuest(true)}
          />
        </View>
      </View>
    );
  }

  // Existing logged-in customers and guests who explicitly
  // selected Explore use the existing discovery experience.
  return (
    <BusinessProvider organizationId={organizationId}>
      <LocalizationProvider>
        <DiscoverContent />
      </LocalizationProvider>
    </BusinessProvider>
  );
}

function DiscoverContent() {
  const router = useRouter();
  const auth = useAuth();

  const { organizationId, productId, planId, section } = useLocalSearchParams<{
    organizationId: string;

    productId?: string;
    planId?: string;
    section?: string;
  }>();

  const {
    customerId,
    profiles,
    customersLoading,
    setActiveContext,
    membershipSummary,
    organizationId: activeOrganizationId,
    subscriptionId: activeSubscriptionId,
  } = useCustomerContext();
  const activeContextRef = useRef({
    activeOrganizationId,
    activeSubscriptionId,
  });
  activeContextRef.current = { activeOrganizationId, activeSubscriptionId };

  const { t } = useTranslation();

  const theme = useTheme();

  const [status, setStatus] = useState<LoadStatus>("loading");

  const [detail, setDetail] = useState<CustomerDiscoveryDetail | null>(null);

  const [regularOffers, setRegularOffers] = useState<Offer[]>([]);

  const [membershipPurchaseOffers, setMembershipPurchaseOffers] = useState<
    CustomerCombinedOffer[]
  >([]);

  const [memberships, setMemberships] = useState<MembershipBundle[]>([]);
  const [historyRedemptions, setHistoryRedemptions] = useState<Redemption[]>(
    [],
  );

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const hasOrganizationRelationship = profiles.some(
    (relationship) =>
      relationship.userId === customerId &&
      relationship.organizationId === organizationId,
  );

  const load = useCallback(async () => {
    if (customersLoading) {
      return;
    }
    if (!organizationId) {
      setStatus("error");

      return;
    }

    setStatus("loading");

    try {
      const published =
        await services.customerData.discoverOrganizationDetail(organizationId);

      const combinedOffersResult = await Promise.allSettled([
        services.customerData.combinedOffers(organizationId),
      ]);

      const protectedReads = hasOrganizationRelationship
        ? await Promise.allSettled([
            services.customerData.subscriptions(organizationId, customerId),
            services.customerData.redemptions(organizationId, customerId),
          ])
        : null;

      if (protectedReads?.[0].status === "rejected")
        throw protectedReads[0].reason;

      const subscriptions =
        protectedReads?.[0].status === "fulfilled"
          ? protectedReads[0].value
          : [];

      const redemptions =
        protectedReads?.[1].status === "fulfilled"
          ? protectedReads[1].value.map(redemptionFromProtectedRow)
          : [];

      const statusLists = await Promise.all(
        subscriptions.map((subscription) =>
          services.customerData.redemptionItemStatuses(
            organizationId,

            subscription.id,
          ),
        ),
      );

      const statusesBySubscription = new Map(
        subscriptions.map((subscription, index) => [
          subscription.id,

          statusLists[index],
        ]),
      );

      // The public catalog can omit the owned product or just its subscribed
      // plan. Use the authorized summary only when the public data is incomplete.
      const needsOwnedProducts = subscriptions.some(
        (row) =>
          !published.membershipProducts.some(
            (product) =>
              product.id === row.membershipProductId &&
              product.plans.some((plan) => plan.id === row.subscriptionPlanId),
          ),
      );
      const ownedSummary = needsOwnedProducts
        ? await membershipSummary(organizationId)
        : null;
      const bundles = await Promise.all(
        subscriptions.map(async (row): Promise<MembershipBundle> => {
          const product = resolveOwnedMembershipProduct(
            published.membershipProducts.find(
              (candidate) => candidate.id === row.membershipProductId,
            ),
            ownedSummary?.membershipProducts.find(
              (candidate) => candidate.id === row.membershipProductId,
            ),
            row.subscriptionPlanId,
          );

          if (!product) {
            throw new Error("Membership product is unavailable.");
          }
          const subscriptionStatus = await services.status.getStatus(
            row.subscriptionStatusId,
          );
          if (!subscriptionStatus)
            throw new Error("Membership status is unavailable.");

          return {
            subscription: subscriptionFromProtectedRow(row),
            subscriptionStatus,

            product,

            benefits: published.benefits.filter((benefit) =>
              product.benefitIds.includes(benefit.id),
            ),

            redemptions: redemptions.filter(
              (redemption) => redemption.subscriptionId === row.id,
            ),

            redemptionItemStatuses: statusesBySubscription.get(row.id) ?? [],
          };
        }),
      );

      setDetail(published);

      const combinedOffers =
        combinedOffersResult[0].status === "fulfilled"
          ? combinedOffersResult[0].value
          : [];

      setRegularOffers(
        combinedOffers.flatMap((offer) =>
          offer.offerType === "REGULAR" && offer.regularOffer
            ? [offer.regularOffer]
            : [],
        ),
      );

      setMembershipPurchaseOffers(
        combinedOffers.filter(
          (offer) => offer.offerType === "MEMBERSHIP_PURCHASE",
        ),
      );

      setMemberships(bundles);
      setHistoryRedemptions(redemptions);

      setSelectedSubId((previous) => {
        const { activeOrganizationId, activeSubscriptionId } =
          activeContextRef.current;
        if (bundles.some((bundle) => bundle.subscription.id === previous))
          return previous;
        if (
          activeOrganizationId === organizationId &&
          bundles.some(
            (bundle) => bundle.subscription.id === activeSubscriptionId,
          )
        ) {
          return activeSubscriptionId;
        }
        return (
          bundles.find(
            (bundle) =>
              bundle.subscriptionStatus.statusCode.toUpperCase() === "ACTIVE",
          )?.subscription.id ??
          bundles[0]?.subscription.id ??
          null
        );
      });

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [
    customerId,
    organizationId,
    customersLoading,
    hasOrganizationRelationship,
    membershipSummary,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const exit = () => {
    if (productId) {
      router.replace({
        pathname: "/discover/[organizationId]",
        params: {
          organizationId,
          section: "memberships",
        },
      });
      return;
    }

    if (auth.session) {
      router.replace(APP_ROUTES.customer.home as never);
      return;
    }

    router.back();
  };

  const joinMembership = (id: string, selectedPlanId?: string) => {
    router.push(
      APP_ROUTES.join.membership(
        organizationId,

        id,
        selectedPlanId,
      ) as never,
    );
  };

  const joinWithMembershipOffer = (
    offerId: string,

    displayName: string,
    id: string,
    selectedPlanId?: string,
  ) => {
    router.push(
      `${APP_ROUTES.join.membership(organizationId, id, selectedPlanId)}&explicitOfferId=${encodeURIComponent(
        offerId,
      )}&explicitOfferName=${encodeURIComponent(displayName)}` as never,
    );
  };

  if (status !== "ready" || !detail) {
    return (
      <View
        style={{
          flex: 1,

          backgroundColor: theme.colors.background,

          justifyContent: "center",

          padding: theme.spacing.lg,
        }}
      >
        {status === "error" ? (
          <StateView
            kind="error"
            title={t("common.error")}
            actionLabel={t("common.retry")}
            onAction={load}
            testID="discover-state"
          />
        ) : (
          <StateView
            kind="loading"
            message={t("common.loading")}
            testID="discover-state"
          />
        )}
      </View>
    );
  }

  const focused =
    memberships.find((item) => item.subscription.id === selectedSubId) ??
    memberships[0];
  const selectedMembership = productId ? undefined : focused;

  const activePlanIds = activeMembershipPlanIds(
    memberships.map(({ subscription, subscriptionStatus }) => ({
      planId: subscription.subscriptionPlanId,
      status: subscriptionStatus.statusCode,
    })),
  );
  const available = discoverableMembershipProducts(
    detail.membershipProducts,
    activePlanIds,
  );

  return (
    <View style={{ flex: 1 }}>
      <BusinessExperience
        scrollableMobileWebHeader
        publicDiscoveryNavigation
        content={detail.publishedExperience.definition.content}
        configurationOverride={detail.publishedExperience.configuration}
        templateOverride={
          detail.publishedExperience.template as TemplateDefinition
        }
        organizationOverride={detail.organization as never}
        detailsOverride={
          detail.publishedExperience.organizationDetails as never
        }
        brandingOverride={
          detail.publishedExperience.organizationBranding as never
        }
        tagline={
          detail.publishedExperience.organizationBranding?.tagline ?? undefined
        }
        heroImageUrl={
          detail.publishedExperience.organizationBranding?.heroImageUrl ??
          undefined
        }
        previewDefinition={detail.publishedExperience.definition}
        subscription={selectedMembership?.subscription}
        subscriptionStatus={selectedMembership?.subscriptionStatus}
        product={selectedMembership?.product}
        benefits={selectedMembership?.benefits ?? []}
        benefitUsageRules={detail.benefitUsageRules as never}
        redemptionItemStatuses={
          selectedMembership?.redemptionItemStatuses ?? []
        }
        offers={
          productId
            ? detail.offers.filter((offer) =>
                regularOffers.some(
                  (availableOffer) => availableOffer.id === offer.id,
                ),
              )
            : regularOffers
        }
        membershipPurchaseOffers={membershipPurchaseOffers}
        offerUsageRules={detail.offerUsageRules as never}
        stores={detail.stores}
        redemptions={selectedMembership?.redemptions ?? []}
        historyRedemptions={historyRedemptions}
        historyBenefits={detail.benefits}
        historyMemberships={memberships}
        memberships={memberships
          .filter(
            (item) =>
              item.subscriptionStatus.statusCode?.toUpperCase() === "ACTIVE",
          )
          .map(({ subscription, product }) => ({
            subscription,

            product,
          }))}
        selectedSubscriptionId={selectedMembership?.subscription.id ?? ""}
        onSelectSubscription={(id) => {
          setSelectedSubId(id);

          setActiveContext(
            organizationId,

            id,
          );
        }}
        availableMemberships={available}
        detailsCatalog={detail.membershipProducts}
        planDetailsProductId={productId}
        planDetailsPlanId={planId}
        showAvailableMembershipsFirst={
          section === "memberships" || (!productId && available.length > 0)
        }
        onJoin={joinMembership}
        onUseMembershipPurchaseOffer={joinWithMembershipOffer}
        onExit={exit}
        onRefreshRedemptionState={load}
        customerUserId={customerId}
      />
      {!auth.loading && !auth.session ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          <Text variant="bodyStrong">Already a Memgine customer?</Text>

          <Button
            label="Sign in to Memgine"
            testID="discover-existing-customer-login"
            onPress={() => {
              const returnTo = `/discover/${encodeURIComponent(organizationId)}`;

              router.push({
                pathname: APP_ROUTES.customerLogin,
                params: { returnTo },
              } as never);
            }}
          />
        </View>
      ) : null}

      <AppInstallSection />
    </View>
  );
}
