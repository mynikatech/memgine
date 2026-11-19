import { useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useRef, useState } from "react";

import { Linking, Platform, View } from "react-native";

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

function AppInstallSection() {
  if (Platform.OS !== "web" || (!androidInstallUrl && !iosInstallUrl)) {
    return null;
  }

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 10,
      }}
      testID="discover-app-install"
    >
      <Text variant="bodyStrong" color="text">
        Get the Memgine app
      </Text>

      <Text variant="bodySmall" color="textSecondary">
        You can continue on the web or install the app for future visits.
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {androidInstallUrl ? (
          <Button
            label="Get it on Google Play"
            size="sm"
            variant="outline"
            onPress={() => void Linking.openURL(androidInstallUrl)}
          />
        ) : null}

        {iosInstallUrl ? (
          <Button
            label="Get it on the App Store"
            size="sm"
            variant="outline"
            onPress={() => void Linking.openURL(iosInstallUrl)}
          />
        ) : null}
      </View>
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
  const { organizationId } = useLocalSearchParams<{
    organizationId: string;
  }>();

  if (!organizationId) {
    return null;
  }

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

  const exit = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(APP_ROUTES.customer.cards);

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
        showAvailableMembershipsFirst={section === "memberships"}
        onJoin={joinMembership}
        onUseMembershipPurchaseOffer={joinWithMembershipOffer}
        onExit={exit}
        onRefreshRedemptionState={load}
        customerUserId={customerId}
      />

      <AppInstallSection />
    </View>
  );
}
