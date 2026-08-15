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
import { BusinessExperience } from "@/src/experience";
import {
  useBusiness,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";
import { StateView } from "@/src/ui";

type Status = "loading" | "error" | "ready";

/** A single subscription and its resolved domain data (per-membership). */
type MembershipBundle = {
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

/**
 * Business Experience route — the branded, template-driven experience for a
 * selected membership. Pushed OVER the Memgine platform tabs so it feels like
 * the business's own app while remaining inside the Memgine window.
 *
 * When the customer holds MULTIPLE subscriptions for the SAME organization,
 * all of them are loaded so the experience can offer an in-place membership
 * selector; switching changes only the selected subscription (organization,
 * branding, template and navigation stay the same).
 */
export default function BusinessExperienceRoute() {
  const router = useRouter();
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
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

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const initial = subscriptionId
        ? await mockServices.subscription.getSubscription(subscriptionId)
        : null;
      if (!initial) {
        setStatus("error");
        return;
      }
      setActiveBusiness(initial.organizationId);
      setActiveContext(initial.organizationId, initial.id);

      // All of the customer's subscriptions for THIS SAME organization.
      const all = await mockServices.subscription.listByCustomer(
        initial.customerId,
      );
      const siblings = all.filter(
        (s) => s.organizationId === initial.organizationId,
      );

      const bundles = (
        await Promise.all(
          siblings.map(async (s) => {
            const product = await mockServices.membershipProduct.getProduct(
              s.membershipProductId,
            );
            if (!product) return null;
            const [benefits, redemptions] = await Promise.all([
              mockServices.benefit.listByProduct(s.membershipProductId),
              mockServices.redemption.listBySubscription(s.id),
            ]);
            return {
              subscription: s,
              product,
              benefits,
              redemptions,
            } as MembershipBundle;
          }),
        )
      ).filter((b): b is MembershipBundle => b !== null);

      if (!bundles.length) {
        setStatus("error");
        return;
      }

      // Organization-level content is shared across the customer's memberships.
      const [orgOffers, orgStores, catalog] = await Promise.all([
        mockServices.offer.listByOrganization(initial.organizationId),
        mockServices.organization.listStores(initial.organizationId),
        mockServices.membershipProduct.listProducts(initial.organizationId),
      ]);

      // "Available Memberships" = published products the customer does NOT own.
      const ownedProductIds = new Set(bundles.map((b) => b.product.id));
      const available = catalog.filter(
        (p) =>
          p.productStatusId === "product-status-active" &&
          !ownedProductIds.has(p.id),
      );

      setMemberships(bundles);
      setAvailableMemberships(available);
      setOffers(orgOffers);
      setStores(orgStores);
      setSelectedSubId(
        bundles.some((b) => b.subscription.id === initial.id)
          ? initial.id
          : bundles[0].subscription.id,
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [subscriptionId, setActiveContext, setActiveBusiness]);

  useEffect(() => {
    load();
  }, [load]);

  const current =
    memberships.find((m) => m.subscription.id === selectedSubId) ??
    memberships[0];

  const selectSubscription = (id: string) => {
    setSelectedSubId(id);
    setActiveSubscription(id);
  };

  const joinMembership = (productId: string) => {
    if (!current) return;
    // Reuse the existing Stage 4 purchase flow, passing org + product.
    router.push(
      `/join?organizationId=${current.subscription.organizationId}&productId=${productId}`,
    );
  };

  const exit = () =>
    router.canGoBack() ? router.back() : router.replace("/cards");

  if (status === "ready" && current) {
    return (
      <BusinessExperience
        content={getBusinessContent(current.subscription.organizationId)}
        subscription={current.subscription}
        product={current.product}
        benefits={current.benefits}
        offers={offers}
        stores={stores}
        redemptions={current.redemptions}
        memberships={memberships.map((m) => ({
          subscription: m.subscription,
          product: m.product,
        }))}
        selectedSubscriptionId={current.subscription.id}
        onSelectSubscription={selectSubscription}
        availableMemberships={availableMemberships}
        onJoin={joinMembership}
        onExit={exit}
      />
    );
  }

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
