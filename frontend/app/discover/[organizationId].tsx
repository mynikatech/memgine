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
import { BillingInterval, getBusinessContent, mockServices } from "@/src/core";
import { BusinessExperience } from "@/src/experience";
import { useBusiness, useCustomerContext, useTheme, useTranslation } from "@/src/providers";
import { Badge, Button, Card, Modal, StateView, Text } from "@/src/ui";

type Status = "loading" | "error" | "ready";
const CUSTOMER_ID = "cust-1";

type MembershipBundle = {
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

/**
 * QR / deep-link gateway — organization-level entry.
 *   /discover/:organizationId              → business experience for that org
 *   /discover/:organizationId?productId=..  → same, then a product detail modal
 *
 * Reuses BusinessExperience + the existing /join purchase flow. The business
 * context is loaded dynamically from the route's organizationId (no hard-coded
 * organization). Works whether or not the customer owns a membership there.
 */
export default function DiscoverGateway() {
  const router = useRouter();
  const { organizationId, productId } = useLocalSearchParams<{
    organizationId: string;
    productId?: string;
  }>();
  const { setActiveBusiness } = useBusiness();
  const { setActiveContext } = useCustomerContext();
  const { t, formatMoney } = useTranslation();
  const theme = useTheme();

  const [status, setStatus] = useState<Status>("loading");
  const [memberships, setMemberships] = useState<MembershipBundle[]>([]);
  const [available, setAvailable] = useState<MembershipProduct[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Product QR → detail
  const [detailProduct, setDetailProduct] = useState<MembershipProduct | null>(null);
  const [detailBenefits, setDetailBenefits] = useState<Benefit[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const context = organizationId
        ? await mockServices.organization.getBusinessContext(organizationId)
        : null;
      if (!context) {
        setStatus("error");
        return;
      }
      // Load the org's business context dynamically (branding/template/locale).
      setActiveBusiness(organizationId);

      // Owned memberships for this organization (if any).
      const all = await mockServices.subscription.listByCustomer(CUSTOMER_ID);
      const owned = all.filter((s) => s.organizationId === organizationId);
      const bundles = (
        await Promise.all(
          owned.map(async (s) => {
            const product = await mockServices.membershipProduct.getProduct(s.membershipProductId);
            if (!product) return null;
            const [benefits, redemptions] = await Promise.all([
              mockServices.benefit.listByProduct(s.membershipProductId),
              mockServices.redemption.listBySubscription(s.id),
            ]);
            return { subscription: s, product, benefits, redemptions } as MembershipBundle;
          }),
        )
      ).filter((b): b is MembershipBundle => b !== null);

      const [orgOffers, orgStores, catalog] = await Promise.all([
        mockServices.offer.listByOrganization(organizationId),
        mockServices.organization.listStores(organizationId),
        mockServices.membershipProduct.listProducts(organizationId),
      ]);

      const ownedProductIds = new Set(bundles.map((b) => b.product.id));
      const availableProducts = catalog.filter((p) => p.isPublished && !ownedProductIds.has(p.id));

      // Product QR: preload the product detail (do NOT bypass it).
      if (productId) {
        const detail = catalog.find((p) => p.id === productId && p.isPublished) ?? null;
        setDetailProduct(detail);
        setDetailBenefits(detail ? await mockServices.benefit.listByProduct(detail.id) : []);
      }

      if (bundles.length) setActiveContext(organizationId, bundles[0].subscription.id);

      setMemberships(bundles);
      setAvailable(availableProducts);
      setOffers(orgOffers);
      setStores(orgStores);
      setSelectedSubId(bundles[0]?.subscription.id ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [organizationId, productId, setActiveBusiness, setActiveContext]);

  useEffect(() => {
    load();
  }, [load]);

  const exit = () => (router.canGoBack() ? router.back() : router.replace("/cards"));

  const joinMembership = (pid: string) => {
    setDetailProduct(null);
    router.push(`/join?organizationId=${organizationId}&productId=${pid}`);
  };

  const priceLabel = (p: MembershipProduct) => {
    const plan = p.plans[0];
    if (!plan) return "";
    const interval =
      plan.billingInterval === BillingInterval.MONTHLY
        ? t("join.perMonth")
        : plan.billingInterval === BillingInterval.YEARLY
          ? t("join.perYear")
          : t("join.oneTime");
    return `${formatMoney(plan.price.amountMinor)} · ${interval}`;
  };

  const focused = memberships.find((m) => m.subscription.id === selectedSubId) ?? memberships[0];

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
          memberships={memberships.map((m) => ({ subscription: m.subscription, product: m.product }))}
          selectedSubscriptionId={focused?.subscription.id ?? ""}
          onSelectSubscription={(id) => setSelectedSubId(id)}
          availableMemberships={available}
          onJoin={joinMembership}
          onExit={exit}
        />

        <Modal
          visible={!!detailProduct}
          onClose={() => setDetailProduct(null)}
          title={detailProduct?.name ?? ""}
          testID="discover-product-detail"
        >
          {detailProduct ? (
            <View style={{ gap: theme.spacing.md }}>
              {detailProduct.tier ? <Badge label={detailProduct.tier} tone="brand" /> : null}
              {detailProduct.description ? (
                <Text variant="body" color="textSecondary">
                  {detailProduct.description}
                </Text>
              ) : null}
              <Text variant="title" color="primary">
                {priceLabel(detailProduct)}
              </Text>
              {detailBenefits.length ? (
                <View style={{ gap: 6 }}>
                  {detailBenefits.map((b) => (
                    <Text key={b.id} variant="bodySmall" color="text">
                      • {b.title}
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", padding: theme.spacing.lg }}>
      {status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={load}
          testID="discover-state"
        />
      ) : (
        <StateView kind="loading" message={t("common.loading")} testID="discover-state" />
      )}
    </View>
  );
}
