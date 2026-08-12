import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type { Benefit, MembershipProduct, Offer, Redemption, Store, Subscription } from "@/src/core";
import { getBusinessContent, mockServices } from "@/src/core";
import { BusinessExperience } from "@/src/experience";
import { useBusiness, useCustomerContext, useTheme, useTranslation } from "@/src/providers";
import { StateView } from "@/src/ui";

type Status = "loading" | "error" | "ready";

/**
 * Business Experience route — the branded, template-driven experience for a
 * selected membership. Pushed OVER the Memgine platform tabs so it feels like
 * the business's own app while remaining inside the Memgine window; the only
 * platform chrome is the "‹ Your Memberships" return and a subtle footer.
 */
export default function BusinessExperienceRoute() {
  const router = useRouter();
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const { organization } = useBusiness();
  const { setActiveContext } = useCustomerContext();
  const { t } = useTranslation();
  const theme = useTheme();

  const [status, setStatus] = useState<Status>("loading");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const sub = subscriptionId ? await mockServices.subscription.getSubscription(subscriptionId) : null;
      if (!sub) {
        setStatus("error");
        return;
      }
      setActiveContext(sub.organizationId, sub.id);
      const [prod, bens, offs, strs, reds] = await Promise.all([
        mockServices.membershipProduct.getProduct(sub.membershipProductId),
        mockServices.benefit.listByProduct(sub.membershipProductId),
        mockServices.offer.listByOrganization(sub.organizationId),
        mockServices.organization.listStores(sub.organizationId),
        mockServices.redemption.listBySubscription(sub.id),
      ]);
      if (!prod) {
        setStatus("error");
        return;
      }
      setSubscription(sub);
      setProduct(prod);
      setBenefits(bens);
      setOffers(offs);
      setStores(strs);
      setRedemptions(reds);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [subscriptionId, setActiveContext]);

  useEffect(() => {
    load();
  }, [load]);

  const exit = () => (router.canGoBack() ? router.back() : router.replace("/cards"));

  if (status === "ready" && subscription && product) {
    return (
      <BusinessExperience
        content={getBusinessContent(subscription.organizationId)}
        subscription={subscription}
        product={product}
        benefits={benefits}
        offers={offers}
        stores={stores}
        redemptions={redemptions}
        onExit={exit}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", padding: theme.spacing.lg }}>
      {status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={load}
          testID="experience-state"
        />
      ) : (
        <StateView kind="loading" message={t("common.loading")} testID="experience-state" />
      )}
    </View>
  );
}
