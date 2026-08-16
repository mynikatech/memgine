import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Store,
  Subscription,
} from "@/src/core";
import { getBusinessContent, mockServices } from "@/src/core";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import { BusinessExperience } from "@/src/experience";
import {
  useBusiness,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";
import { Badge, Button, Modal, StateView, Text } from "@/src/ui";

type Status = "loading" | "error" | "ready";

type MembershipBundle = {
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

/**
 * QR / deep-link gateway — organization-level entry.
 *
 * /discover/:organizationId
 *     -> business experience for that organization
 *
 * /discover/:organizationId?productId=...
 *     -> same experience + product detail modal
 *
 * The organization is supplied by the route and is never taken
 * directly from Subscription because organizationId is now derived
 * through OrganizationUser.
 */
export default function DiscoverGateway() {
  const router = useRouter();

  const { organizationId, productId, as } = useLocalSearchParams<{
    organizationId: string;
    productId?: string;
    as?: string;
  }>();

  const { setActiveBusiness } = useBusiness();

  const { customerId, setActiveContext, setActiveCustomer } =
    useCustomerContext();

  const { t, formatMoney } = useTranslation();
  const theme = useTheme();

  const [status, setStatus] = useState<Status>("loading");

  const [memberships, setMemberships] = useState<MembershipBundle[]>([]);

  const [available, setAvailable] = useState<MembershipProduct[]>([]);

  const [offers, setOffers] = useState<Offer[]>([]);

  const [stores, setStores] = useState<Store[]>([]);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [detailProduct, setDetailProduct] = useState<MembershipProduct | null>(
    null,
  );

  const [detailBenefits, setDetailBenefits] = useState<Benefit[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * ------------------------------------------------------------
       * 1. Resolve the organization/business context.
       * ------------------------------------------------------------
       */
      const context = organizationId
        ? await mockServices.organization.getBusinessContext(organizationId)
        : null;

      if (!context) {
        setStatus("error");
        return;
      }

      /*
       * Load this organization's business context dynamically.
       */
      setActiveBusiness(organizationId);

      /*
       * ------------------------------------------------------------
       * 2. Resolve the active customer.
       *
       * ?as=cust-new-demo is retained as the demo-persona override.
       * ------------------------------------------------------------
       */
      const activeCustomerId = typeof as === "string" && as ? as : customerId;

      if (typeof as === "string" && as && as !== customerId) {
        setActiveCustomer(as);
      }

      /*
       * ------------------------------------------------------------
       * 3. Load all subscriptions belonging to the user.
       *
       * Subscription no longer contains:
       *   - customerId
       *   - organizationId
       *   - membershipProductId
       *
       * Customer ownership is represented through:
       *
       *   User
       *      -> OrganizationUser
       *          -> Subscription
       * ------------------------------------------------------------
       */
      const all =
        await mockServices.subscription.listByCustomer(activeCustomerId);

      /*
       * ------------------------------------------------------------
       * 4. Keep only subscriptions belonging to THIS organization.
       *
       * Subscription
       *   -> organizationUserId
       *      -> OrganizationUser.organizationId
       * ------------------------------------------------------------
       */
      const organizationSubscriptions: Subscription[] = [];

      for (const subscription of all) {
        const organizationUser =
          await mockServices.organization.getOrganizationUser(
            subscription.organizationUserId,
          );

        if (
          organizationUser &&
          organizationUser.organizationId === organizationId
        ) {
          organizationSubscriptions.push(subscription);
        }
      }

      /*
       * ------------------------------------------------------------
       * 5. Resolve each subscription:
       *
       * Subscription
       *   -> SubscriptionPlan
       *      -> MembershipProduct
       *         -> Benefits
       *
       * Subscription
       *   -> Redemptions
       * ------------------------------------------------------------
       */
      const resolvedBundles = await Promise.all(
        organizationSubscriptions.map(async (subscription) => {
          /*
           * Subscription -> SubscriptionPlan
           */
          const plan = await mockServices.subscriptionPlan.getPlan(
            subscription.subscriptionPlanId,
          );

          if (!plan) {
            return null;
          }

          /*
           * SubscriptionPlan -> MembershipProduct
           */
          const product = await mockServices.membershipProduct.getProduct(
            plan.membershipProductId,
          );

          if (!product) {
            return null;
          }

          /*
           * MembershipProduct -> Benefits
           */
          const benefits = await mockServices.benefit.listByProduct(
            plan.membershipProductId,
          );

          /*
           * Subscription -> Redemptions
           */
          const redemptions = await mockServices.redemption.listBySubscription(
            subscription.id,
          );

          return {
            subscription,
            product,
            benefits,
            redemptions,
          };
        }),
      );

      const bundles: MembershipBundle[] = resolvedBundles.filter(
        (bundle): bundle is MembershipBundle => bundle !== null,
      );

      /*
       * ------------------------------------------------------------
       * 6. Load organization-level content.
       * ------------------------------------------------------------
       */
      const [orgOffers, orgStores, catalog] = await Promise.all([
        mockServices.offer.listByOrganization(organizationId),

        mockServices.organization.listStores(organizationId),

        mockServices.membershipProduct.listProducts(organizationId),
      ]);

      /*
       * ------------------------------------------------------------
       * 7. Work out which membership products the customer already
       * owns.
       * ------------------------------------------------------------
       */
      const ownedProductIds = new Set(
        bundles.map((bundle) => bundle.product.id),
      );

      /*
       * Active products which the customer does not
       * currently own.
       */
      const availableProducts = catalog.filter(
        (product) =>
          product.productStatusId === "product-status-active" &&
          !ownedProductIds.has(product.id),
      );

      /*
       * ------------------------------------------------------------
       * 8. Product QR/deep-link.
       *
       * If productId is supplied, preload the product detail.
       * ------------------------------------------------------------
       */
      if (productId) {
        const detail =
          catalog.find(
            (product) =>
              product.id === productId &&
              product.productStatusId === "product-status-active",
          ) ?? null;

        setDetailProduct(detail);

        setDetailBenefits(
          detail ? await mockServices.benefit.listByProduct(detail.id) : [],
        );
      } else {
        setDetailProduct(null);
        setDetailBenefits([]);
      }

      /*
       * If the customer already owns a membership in this
       * organization, make the first one the active context.
       */
      if (bundles.length > 0) {
        setActiveContext(organizationId, bundles[0].subscription.id);
      }

      setMemberships(bundles);
      setAvailable(availableProducts);
      setOffers(orgOffers);
      setStores(orgStores);

      setSelectedSubId(bundles[0]?.subscription.id ?? null);

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [
    organizationId,
    productId,
    as,
    customerId,
    setActiveBusiness,
    setActiveContext,
    setActiveCustomer,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * --------------------------------------------------------------
   * Navigation
   * --------------------------------------------------------------
   */

  const exit = () =>
    router.canGoBack() ? router.back() : router.replace("/cards");

  /*
   * Start the existing purchase flow.
   */
  const joinMembership = (pid: string) => {
    setDetailProduct(null);

    router.push(`/join?organizationId=${organizationId}&productId=${pid}`);
  };

  /*
   * Display the first plan's price for the product.
   */
  const priceLabel = (product: MembershipProduct) => {
    const plan = product.plans[0];

    if (!plan) {
      return "";
    }

    const interval = getSubscriptionPeriodLabel(plan);

    return `${formatMoney(plan.price.amountMinor)} · ${interval}`;
  };

  /*
   * Currently selected owned membership.
   */
  const focused =
    memberships.find(
      (membership) => membership.subscription.id === selectedSubId,
    ) ?? memberships[0];

  /*
   * --------------------------------------------------------------
   * READY
   * --------------------------------------------------------------
   */
  if (status === "ready") {
    return (
      <View style={{ flex: 1 }}>
        <BusinessExperience
          content={getBusinessContent(organizationId)}
          subscription={focused?.subscription}
          product={focused?.product}
          benefits={focused?.benefits ?? []}
          offers={offers}
          stores={stores}
          redemptions={focused?.redemptions ?? []}
          memberships={memberships.map((membership) => ({
            subscription: membership.subscription,
            product: membership.product,
          }))}
          selectedSubscriptionId={focused?.subscription.id ?? ""}
          onSelectSubscription={(id) => {
            setSelectedSubId(id);

            setActiveContext(organizationId, id);
          }}
          availableMemberships={available}
          onJoin={joinMembership}
          onExit={exit}
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

              {detailBenefits.length > 0 ? (
                <View
                  style={{
                    gap: 6,
                  }}
                >
                  {detailBenefits.map((benefit) => (
                    <Text key={benefit.id} variant="bodySmall" color="text">
                      • {benefit.displayName ?? benefit.benefitName}
                    </Text>
                  ))}
                </View>
              ) : null}

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

  /*
   * --------------------------------------------------------------
   * LOADING / ERROR
   * --------------------------------------------------------------
   */
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
