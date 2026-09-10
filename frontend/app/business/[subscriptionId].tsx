import { useLocalSearchParams, useRouter } from "expo-router";
import type { OrganizationDetails } from "@/src/core";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";

import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Store,
  Subscription,
  Status as DomainStatus,
} from "@/src/core";

import {
  F_AND_B_DEFAULT_CONTENT,
  SALON_DEFAULT_CONTENT,
  getBusinessContent,
  services,
} from "@/src/core";
import { BusinessExperience } from "@/src/experience";

import {
  useBusiness,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";

import { StateView } from "@/src/ui";

type Status = "loading" | "error" | "ready";

type MembershipBundle = {
  subscription: Subscription;
  subscriptionStatus?: DomainStatus;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

/**
 * Customer Business Experience route.
 *
 * Data resolution is intentionally product-architecture-first:
 *
 * Subscription
 *   -> OrganizationUser -> organizationId / userId
 *
 * Subscription.subscriptionPlanId
 *   -> MembershipProduct.plans[].id
 *   -> MembershipProduct
 *
 * MembershipProduct.benefitIds
 *   -> Benefit.listByOrganization()
 *
 * Local services are the primary source. Their temporary mock fallback
 * remains available underneath the service boundary for legacy/demo data.
 */
export default function BusinessExperienceRoute() {
  const router = useRouter();

  const { subscriptionId } = useLocalSearchParams<{
    subscriptionId: string;
  }>();

  const { setActiveBusiness, template } = useBusiness();
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
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    string | null
  >(null);
  const [activeOrganizationLogoUrl, setActiveOrganizationLogoUrl] = useState<
    string | undefined
  >(undefined);

  const [activeOrganizationTagline, setActiveOrganizationTagline] = useState<
    string | undefined
  >(undefined);

  const [activeOrganizationHeroImageUrl, setActiveOrganizationHeroImageUrl] =
    useState<string | undefined>(undefined);

  const [activeOrganizationDetails, setActiveOrganizationDetails] =
    useState<OrganizationDetails | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      // 1. Resolve the selected subscription.
      const initial = subscriptionId
        ? await services.subscription.getSubscription(subscriptionId)
        : null;

      if (!initial) {
        setStatus("error");
        return;
      }

      // 2. Resolve the business/customer relationship.
      const initialOrganizationUser =
        await services.organization.getOrganizationUser(
          initial.organizationUserId,
        );

      if (!initialOrganizationUser) {
        setStatus("error");
        return;
      }

      const organizationId = initialOrganizationUser.organizationId;
      const customerId = initialOrganizationUser.userId;

      setActiveOrganizationId(organizationId);

      // The membership card must use the selected subscription's own business
      // branding, not whichever business happens to be active in the global
      // provider. This is the same canonical branding source used by the
      // Customer Wallet.
      const [organizationBranding, organizationDetails] = await Promise.all([
        services.organization.getOrganizationBranding(organizationId),
        services.organization.getOrganizationDetails(organizationId),
      ]);

      setActiveOrganizationDetails(organizationDetails ?? null);

      setActiveOrganizationLogoUrl(
        organizationBranding?.logoUrl?.trim() || undefined,
      );
      setActiveOrganizationTagline(
        organizationBranding?.tagline?.trim() || undefined,
      );
      setActiveOrganizationHeroImageUrl(
        organizationBranding?.heroImageUrl?.trim() || undefined,
      );

      setActiveBusiness(organizationId);
      setActiveContext(organizationId, initial.id);
      setActiveSubscription(initial.id);

      // 3. Get all subscriptions belonging to the same global User.
      const customerSubscriptions =
        await services.subscription.listByCustomer(customerId);

      const resolvedSubscriptions = await Promise.all(
        customerSubscriptions.map(async (subscription) => {
          const organizationUser =
            await services.organization.getOrganizationUser(
              subscription.organizationUserId,
            );

          return {
            subscription,
            organizationUser,
          };
        }),
      );

      // Only subscriptions belonging to the selected business are shown
      // inside this Business Experience.
      const siblings = resolvedSubscriptions
        .filter(
          ({ organizationUser }) =>
            organizationUser?.organizationId === organizationId,
        )
        .map(({ subscription }) => subscription);

      // 4. Load the business membership catalog once.
      //
      // This is important for newly-created Org Admin products. We do NOT
      // resolve the plan through the old standalone/mock subscription-plan
      // lookup because the canonical product model stores plans inside
      // MembershipProduct.plans[].
      const catalog =
        await services.membershipProduct.listProducts(organizationId);

      // 5. Resolve each subscription through:
      //
      // Subscription.subscriptionPlanId
      //      -> MembershipProduct.plans[].id
      //      -> MembershipProduct
      //      -> MembershipProduct.benefitIds
      //
      // The local service remains the primary source and may temporarily
      // fall back to legacy mock data where persisted data is absent.
      const resolvedBundles = await Promise.all(
        siblings.map(async (subscription): Promise<MembershipBundle | null> => {
          const product = catalog.find(
            (candidate) =>
              !candidate.isDeleted &&
              candidate.plans.some(
                (plan) => plan.id === subscription.subscriptionPlanId,
              ),
          );

          if (!product) {
            return null;
          }

          const matchedPlan = product.plans.find(
            (plan) => plan.id === subscription.subscriptionPlanId,
          );

          if (!matchedPlan) {
            return null;
          }

          const organizationBenefits =
            await services.benefit.listByOrganization(organizationId);

          const benefits = organizationBenefits.filter(
            (benefit) =>
              !benefit.isDeleted && product.benefitIds.includes(benefit.id),
          );

          const redemptions = await services.redemption.listBySubscription(
            subscription.id,
          );

          const subscriptionEntityStatus =
            await services.status.getEntityStatus(
              subscription.subscriptionStatusId,
            );

          const subscriptionStatus =
            (subscriptionEntityStatus
              ? await services.status.getStatus(
                  subscriptionEntityStatus.statusId,
                )
              : await services.status.getStatus(
                  subscription.subscriptionStatusId,
                )) ?? undefined;

          return {
            subscription,
            subscriptionStatus,
            product: {
              ...product,
              // BusinessExperience currently derives the membership headline
              // from product.displayName. For the customer-facing projection,
              // present the selected plan first and keep the product brand next
              // to it: e.g. "SILVER ARTISAN PASS".
              displayName:
                [
                  matchedPlan.subscriptionPlanName,
                  product.membershipProductName,
                ]
                  .filter(Boolean)
                  .join(" ") || product.displayName,
              plans: [
                matchedPlan,
                ...product.plans.filter((plan) => plan.id !== matchedPlan.id),
              ],
            },
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

      // 6. Organization-level experience data.
      //
      // These services are AsyncStorage-first through the local service
      // registry, with the temporary mock fallback retained underneath.
      const [orgOffers, orgStores] = await Promise.all([
        services.offer.listByOrganization(organizationId),
        services.organization.listStores(organizationId),
      ]);

      const ownedProductIds = new Set(
        bundles.map((bundle) => bundle.product.id),
      );

      const available = catalog.filter(
        (product) =>
          !product.isDeleted &&
          product.productStatusId === "product-status-active" &&
          !ownedProductIds.has(product.id),
      );

      setMemberships(bundles);
      setAvailableMemberships(available);
      setOffers(orgOffers);
      setStores(orgStores);

      const selectedId = bundles.some(
        (bundle) => bundle.subscription.id === initial.id,
      )
        ? initial.id
        : bundles[0].subscription.id;

      setSelectedSubId(selectedId);
      setActiveSubscription(selectedId);

      setStatus("ready");
    } catch (error) {
      console.error("BUSINESS EXPERIENCE LOAD FAILED", error);
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

  const current =
    memberships.find(
      (membership) => membership.subscription.id === selectedSubId,
    ) ?? memberships[0];

  const selectSubscription = (id: string) => {
    setSelectedSubId(id);
    setActiveSubscription(id);
  };

  const joinMembership = async (productId: string) => {
    if (!current) {
      return;
    }

    const organizationUser = await services.organization.getOrganizationUser(
      current.subscription.organizationUserId,
    );

    if (!organizationUser) {
      return;
    }

    router.push(
      APP_ROUTES.join.membership(
        organizationUser.organizationId,
        productId,
      ) as never,
    );
  };

  const exit = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.customer.cards);
    }
  };

  if (status === "ready" && current && activeOrganizationId) {
    /*
     * Organization-owned content is still being migrated to the persisted
     * configuration/content layer. Known legacy organizations continue to
     * use their registered organization content. For a newly onboarded
     * organization whose content has not yet been persisted, fall back to
     * the platform starter content that matches the active template.
     *
     * This prevents a newly-created Glow Studio (or another new business)
     * from crashing simply because its dynamic organization ID is not in the
     * legacy static business-content registry.
     */
    let businessContent;
    try {
      businessContent = getBusinessContent(activeOrganizationId);
    } catch {
      const templateCategory = String(template?.category ?? "").toLowerCase();
      businessContent = templateCategory.includes("beauty")
        ? SALON_DEFAULT_CONTENT
        : F_AND_B_DEFAULT_CONTENT;
    }

    return (
      <BusinessExperience
        content={businessContent}
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
        membershipLogoUrl={activeOrganizationLogoUrl}
        tagline={activeOrganizationTagline}
        heroImageUrl={activeOrganizationHeroImageUrl}
        detailsOverride={activeOrganizationDetails}
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
