import { useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useState } from "react";

import { View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Subscription,
} from "@/src/core";

import { RedemptionMethod, services } from "@/src/core";

import type { TemplateDefinition } from "@/src/core/template/template-definition";

import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";

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

import { Badge, Button, Modal, StateView, Text } from "@/src/ui";

type LoadStatus = "loading" | "error" | "ready";

type MembershipBundle = {
  subscription: Subscription;

  product: MembershipProduct;

  benefits: Benefit[];

  redemptions: Redemption[];

  redemptionItemStatuses: CustomerRedemptionItemStatus[];
};

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

  const { organizationId, productId } = useLocalSearchParams<{
    organizationId: string;

    productId?: string;
  }>();

  const { customerId, setActiveContext } = useCustomerContext();

  const { t, formatMoney } = useTranslation();

  const theme = useTheme();

  const [status, setStatus] = useState<LoadStatus>("loading");

  const [detail, setDetail] = useState<CustomerDiscoveryDetail | null>(null);

  const [regularOffers, setRegularOffers] = useState<Offer[]>([]);

  const [membershipPurchaseOffers, setMembershipPurchaseOffers] = useState<
    CustomerCombinedOffer[]
  >([]);

  const [memberships, setMemberships] = useState<MembershipBundle[]>([]);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [detailProduct, setDetailProduct] = useState<MembershipProduct | null>(
    null,
  );

  const load = useCallback(async () => {
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

      const protectedReads = await Promise.allSettled([
        services.customerData.subscriptions(organizationId, customerId),

        services.customerData.redemptions(organizationId, customerId),
      ]);

      const subscriptions =
        protectedReads[0].status === "fulfilled" ? protectedReads[0].value : [];

      const redemptions =
        protectedReads[1].status === "fulfilled"
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

      const bundles = subscriptions.flatMap((row) => {
        const product = published.membershipProducts.find((candidate) =>
          candidate.plans.some((plan) => plan.id === row.subscriptionPlanId),
        );

        if (!product) {
          return [];
        }

        return [
          {
            subscription: subscriptionFromProtectedRow(row),

            product,

            benefits: published.benefits.filter((benefit) =>
              product.benefitIds.includes(benefit.id),
            ),

            redemptions: redemptions.filter(
              (redemption) => redemption.subscriptionId === row.id,
            ),

            redemptionItemStatuses: statusesBySubscription.get(row.id) ?? [],
          },
        ];
      });

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

      setSelectedSubId(bundles[0]?.subscription.id ?? null);

      setDetailProduct(
        productId
          ? (published.membershipProducts.find(
              (product) => product.id === productId,
            ) ?? null)
          : null,
      );

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [customerId, organizationId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exit = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(APP_ROUTES.customer.cards);

  const joinMembership = (id: string) => {
    setDetailProduct(null);

    router.push(
      APP_ROUTES.join.membership(
        organizationId,

        id,
      ) as never,
    );
  };

  const joinWithMembershipOffer = (
    offerId: string,

    displayName: string,
  ) => {
    router.push(
      `${APP_ROUTES.join.organization(
        organizationId,
      )}&explicitOfferId=${encodeURIComponent(
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

  const owned = new Set(memberships.map((membership) => membership.product.id));

  const available = detail.membershipProducts.filter(
    (product) => !owned.has(product.id),
  );

  const productBenefits = detailProduct
    ? detail.benefits.filter((benefit) =>
        detailProduct.benefitIds.includes(benefit.id),
      )
    : [];

  const priceLabel = (product: MembershipProduct) => {
    const plan = product.plans[0];

    return plan
      ? `${formatMoney(
          plan.price.amountMinor,
        )} · ${getSubscriptionPeriodLabel(plan)}`
      : "";
  };

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
        previewDefinition={detail.publishedExperience.definition}
        subscription={focused?.subscription}
        product={focused?.product}
        benefits={focused?.benefits ?? []}
        benefitUsageRules={detail.benefitUsageRules as never}
        redemptionItemStatuses={focused?.redemptionItemStatuses ?? []}
        offers={regularOffers}
        membershipPurchaseOffers={membershipPurchaseOffers}
        offerUsageRules={detail.offerUsageRules as never}
        stores={detail.stores}
        redemptions={focused?.redemptions ?? []}
        memberships={memberships.map(({ subscription, product }) => ({
          subscription,

          product,
        }))}
        selectedSubscriptionId={focused?.subscription.id ?? ""}
        onSelectSubscription={(id) => {
          setSelectedSubId(id);

          setActiveContext(
            organizationId,

            id,
          );
        }}
        availableMemberships={available}
        onJoin={joinMembership}
        onUseMembershipPurchaseOffer={joinWithMembershipOffer}
        onExit={exit}
        onRefreshRedemptionState={load}
        customerUserId={customerId}
      />

      <Modal
        visible={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        title={detailProduct?.membershipProductName ?? ""}
        testID="discover-product-detail"
      >
        {detailProduct ? (
          <View
            style={{
              gap: theme.spacing.md,
            }}
          >
            {detailProduct.displayName ? (
              <Badge label={detailProduct.displayName} tone="brand" />
            ) : null}

            {detailProduct.description ? (
              <Text variant="body" color="textSecondary">
                {detailProduct.description}
              </Text>
            ) : null}

            <Text variant="title" color="primary">
              {priceLabel(detailProduct)}
            </Text>

            {productBenefits.map((benefit) => (
              <Text key={benefit.id} variant="bodySmall" color="text">
                • {benefit.displayName ?? benefit.benefitName}
              </Text>
            ))}

            <Button
              label={t("experience.join")}
              onPress={() => joinMembership(detailProduct.id)}
              testID="discover-join"
            />
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
