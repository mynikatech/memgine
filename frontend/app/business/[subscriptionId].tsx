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
  Status as DomainStatus,
} from "@/src/core";
import { getBusinessContent, mockServices } from "@/src/core";
import { BusinessExperience } from "@/src/experience";
import {
  useBusiness,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";
import { StateView } from "@/src/ui";

type Status = "loading" | "error" | "ready";

/**
 * All data required to render one membership inside
 * the business experience.
 */
type MembershipBundle = {
  subscription: Subscription;
  subscriptionStatus?: DomainStatus;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

/**
 * Business Experience route.
 *
 * Final Subscription model:
 *
 * Subscription
 *   ├── organizationUserId
 *   │      └── OrganizationUser
 *   │             ├── organizationId
 *   │             └── userId
 *   │
 *   └── subscriptionPlanId
 *          └── SubscriptionPlan
 *                 └── membershipProductId
 *                        └── MembershipProduct
 */
export default function BusinessExperienceRoute() {
  const router = useRouter();

  const { subscriptionId } = useLocalSearchParams<{
    subscriptionId: string;
  }>();

  const { setActiveBusiness } = useBusiness();

  const { setActiveContext, setActiveSubscription } = useCustomerContext();

  const { t } = useTranslation();
  const theme = useTheme();

  const [status, setStatus] = useState<Status>("loading");

  const [memberships, setMemberships] = useState<MembershipBundle[]>([]);

  const [availableMemberships, setAvailableMemberships] = useState<
    MembershipProduct[]
  >([]);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  /**
   * Organization for the currently displayed business.
   *
   * Subscription itself no longer contains organizationId.
   */
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * ------------------------------------------------------------
       * 1. Load the selected subscription.
       * ------------------------------------------------------------
       */
      const initial = subscriptionId
        ? await mockServices.subscription.getSubscription(subscriptionId)
        : null;

      if (!initial) {
        setStatus("error");
        return;
      }

      /*
       * ------------------------------------------------------------
       * 2. Resolve Subscription -> OrganizationUser.
       *
       * OrganizationUser gives us:
       *
       *   organizationId
       *   userId
       * ------------------------------------------------------------
       */
      const initialOrganizationUser =
        await mockServices.organization.getOrganizationUser(
          initial.organizationUserId,
        );

      if (!initialOrganizationUser) {
        setStatus("error");
        return;
      }

      const organizationId = initialOrganizationUser.organizationId;

      const customerId = initialOrganizationUser.userId;

      setActiveOrganizationId(organizationId);

      /*
       * Set active business and customer context.
       */
      setActiveBusiness(organizationId);

      setActiveContext(organizationId, initial.id);

      setActiveSubscription(initial.id);

      /*
       * ------------------------------------------------------------
       * 3. Get all subscriptions belonging to this global user.
       *
       * listByCustomer() now resolves subscriptions through
       * OrganizationUser.userId.
       * ------------------------------------------------------------
       */
      const customerSubscriptions =
        await mockServices.subscription.listByCustomer(customerId);

      /*
       * We need to identify which of those subscriptions belong
       * to this SAME organization.
       *
       * organizationId is obtained through each subscription's
       * OrganizationUser.
       */
      const resolvedSubscriptions = await Promise.all(
        customerSubscriptions.map(async (subscription) => {
          const organizationUser =
            await mockServices.organization.getOrganizationUser(
              subscription.organizationUserId,
            );

          return {
            subscription,
            organizationUser,
          };
        }),
      );

      const siblings = resolvedSubscriptions
        .filter(
          ({ organizationUser }) =>
            organizationUser?.organizationId === organizationId,
        )
        .map(({ subscription }) => subscription);

      /*
       * ------------------------------------------------------------
       * 4. Resolve every subscription to:
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
        siblings.map(async (subscription): Promise<MembershipBundle | null> => {
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

          /*
           * Subscription -> EntityStatus -> Status
           *
           * subscription.subscriptionStatusId is the EntityStatus.id.
           * EntityStatus.statusId points to the generic Status record.
           */
          const subscriptionEntityStatus =
            await mockServices.entityStatus.getEntityStatus(
              subscription.subscriptionStatusId,
            );

          const subscriptionStatus = subscriptionEntityStatus
            ? ((await mockServices.status.getStatus(
                subscriptionEntityStatus.statusId,
              )) ?? undefined)
            : undefined;

          return {
            subscription,
            subscriptionStatus,
            product,
            benefits,
            redemptions,
          };
        }),
      );

      const bundles = resolvedBundles.filter(
        (bundle): bundle is MembershipBundle => bundle !== null,
      );

      if (bundles.length === 0) {
        setStatus("error");
        return;
      }

      /*
       * ------------------------------------------------------------
       * 5. Load organization-level content.
       * ------------------------------------------------------------
       */
      const [orgOffers, orgStores, catalog] = await Promise.all([
        mockServices.offer.listByOrganization(organizationId),

        mockServices.organization.listStores(organizationId),

        mockServices.membershipProduct.listProducts(organizationId),
      ]);

      /*
       * ------------------------------------------------------------
       * 6. Determine which products the customer already owns.
       * ------------------------------------------------------------
       */
      const ownedProductIds = new Set(
        bundles.map((bundle) => bundle.product.id),
      );

      /*
       * Active products that the customer does not already own.
       */
      const available = catalog.filter(
        (product) =>
          product.productStatusId === "product-status-active" &&
          !ownedProductIds.has(product.id),
      );

      /*
       * ------------------------------------------------------------
       * 7. Set final screen state.
       * ------------------------------------------------------------
       */
      setMemberships(bundles);

      setAvailableMemberships(available);

      setOffers(orgOffers);

      setStores(orgStores);

      /*
       * Keep the subscription from the URL selected.
       */
      const selectedId = bundles.some(
        (bundle) => bundle.subscription.id === initial.id,
      )
        ? initial.id
        : bundles[0].subscription.id;

      setSelectedSubId(selectedId);
      setActiveSubscription(selectedId);

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [
    subscriptionId,
    setActiveBusiness,
    setActiveContext,
    setActiveSubscription,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Current membership displayed in the business experience.
   */
  const current =
    memberships.find(
      (membership) => membership.subscription.id === selectedSubId,
    ) ?? memberships[0];

  /**
   * Switch between subscriptions belonging to this organization.
   */
  const selectSubscription = (id: string) => {
    setSelectedSubId(id);
    setActiveSubscription(id);
  };

  /**
   * Start the existing purchase flow for another membership.
   *
   * The organization ID comes from OrganizationUser rather
   * than Subscription.
   */
  const joinMembership = async (productId: string) => {
    if (!current) {
      return;
    }

    const organizationUser =
      await mockServices.organization.getOrganizationUser(
        current.subscription.organizationUserId,
      );

    if (!organizationUser) {
      return;
    }

    router.push(
      `/join?organizationId=${organizationUser.organizationId}&productId=${productId}`,
    );
  };

  /**
   * Exit the business experience.
   */
  const exit = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/cards");
    }
  };

  /*
   * --------------------------------------------------------------
   * READY
   * --------------------------------------------------------------
   */
  if (status === "ready" && current && activeOrganizationId) {
    return (
      <BusinessExperience
        content={getBusinessContent(activeOrganizationId)}
        subscription={current.subscription}
        subscriptionStatus={current.subscriptionStatus}
        product={current.product}
        benefits={current.benefits}
        offers={offers}
        stores={stores}
        redemptions={current.redemptions}
        memberships={memberships.map((membership) => ({
          subscription: membership.subscription,
          product: membership.product,
        }))}
        selectedSubscriptionId={current.subscription.id}
        onSelectSubscription={selectSubscription}
        availableMemberships={availableMemberships}
        onJoin={joinMembership}
        onExit={exit}
      />
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
          testID="experience-state"
        />
      ) : (
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="experience-state"
        />
      )}
    </View>
  );
}
