import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Status,
  Store,
  BenefitUsageRule,
  OfferUsageRule,
  Subscription,
} from "@/src/core";

import { services } from "@/src/core";
import type { CustomerExperienceReleaseSnapshot } from "@/src/core";

export type PreviewMembership = {
  product: MembershipProduct;
  subscription: Subscription;
  subscriptionStatus?: Status;
  benefits: Benefit[];
  redemptions: Redemption[];
};

export type PreviewDomainData = {
  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;
  benefits: Benefit[];
  organizationBenefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];
  memberships: PreviewMembership[];
  selectedSubscriptionId: string;
  availableMemberships: MembershipProduct[];
  benefitUsageRules: BenefitUsageRule[];
  offerUsageRules: OfferUsageRule[];
};

/**
 * Loads the organization-level customer-facing data for the Proposed preview.
 * No real customer, subscription or redemption history is used.
 *
 * The same function can also be fed a published release snapshot so Current
 * and Proposed are rendered by BusinessExperience from two different data
 * states without maintaining a second renderer.
 */
export async function loadPreviewData(
  organizationId: string,
): Promise<PreviewDomainData> {
  const [
    products,
    offers,
    stores,
    organizationBenefits,
    previewSubscriptionStatus,
  ] = await Promise.all([
    services.membershipProduct.listProducts(organizationId),
    services.offer.listByOrganization(organizationId),
    services.organization.listStores(organizationId),
    services.benefit.listByOrganization(organizationId),
    services.status.getStatusByCode("ACTIVE"),
  ]);

  const [productStatuses, benefitStatuses, offerStatuses, storeStatuses] =
    await Promise.all([
      services.status.listMembershipProductStatuses(),
      services.status.listBenefitStatuses(),
      services.status.listOfferStatuses(),
      services.status.listStoreStatuses(),
    ]);

  const activeProducts = products.filter(
    (product) =>
      !product.isDeleted &&
      isActiveStatus(product.productStatusId, productStatuses) &&
      isCurrentlyEffective(product.effectiveDate, product.expiryDate),
  );

  const activeBenefits = organizationBenefits.filter(
    (benefit) =>
      !benefit.isDeleted &&
      isActiveStatus(benefit.benefitStatusId, benefitStatuses) &&
      isCurrentlyEffective(benefit.effectiveDate, benefit.expiryDate),
  );

  const activeProductIds = new Set(activeProducts.map((product) => product.id));

  const activeOffers = offers.filter(
    (offer) =>
      !offer.isDeleted &&
      isActiveStatus(offer.statusId, offerStatuses) &&
      isCurrentlyEffective(offer.effectiveDate, offer.expiryDate) &&
      (!offer.membershipProductId ||
        activeProductIds.has(offer.membershipProductId)),
  );

  const activeStores = stores.filter(
    (store) =>
      !store.isDeleted && isActiveStatus(store.storeStatusId, storeStatuses),
  );

  const [benefitUsageRules, offerUsageRules] = await Promise.all([
    Promise.all(
      activeBenefits.map((benefit) =>
        services.benefitUsageRule.listByBenefit(benefit.id),
      ),
    ).then((rules) => rules.flat().filter((rule) => !rule.isDeleted)),
    Promise.all(
      activeOffers.map((offer) =>
        services.offerUsageRule.listByOffer(offer.id),
      ),
    ).then((rules) => rules.flat().filter((rule) => !rule.isDeleted)),
  ]);

  return buildPreviewDomainData(
    activeProducts,
    activeBenefits,
    activeOffers,
    activeStores,
    previewSubscriptionStatus ?? undefined,
    benefitUsageRules,
    offerUsageRules,
  );
}

export async function loadPreviewDataFromRelease(
  snapshot: CustomerExperienceReleaseSnapshot,
): Promise<PreviewDomainData> {
  const previewSubscriptionStatus =
    await services.status.getStatusByCode("ACTIVE");

  return buildPreviewDomainData(
    snapshot.membershipProducts,
    snapshot.benefits,
    snapshot.offers,
    snapshot.stores,
    previewSubscriptionStatus ?? undefined,
    snapshot.benefitUsageRules,
    snapshot.offerUsageRules,
  );
}

function buildPreviewDomainData(
  products: MembershipProduct[],
  organizationBenefits: Benefit[],
  offers: Offer[],
  stores: Store[],
  previewSubscriptionStatus?: Status,
  benefitUsageRules: BenefitUsageRule[] = [],
  offerUsageRules: OfferUsageRule[] = [],
): PreviewDomainData {
  // The customer renderer displays MembershipProduct.displayName.
  // Build the preview display name using the exact same plan + product
  // projection used by the real customer Business Experience.
  const previewProducts = [...products]
    .map((product) => withPreviewMembershipDisplayName(product))
    .sort(comparePreviewMembershipProducts);

  const memberships: PreviewMembership[] = previewProducts.map((product) => {
    const benefits = organizationBenefits.filter((benefit) =>
      product.benefitIds.includes(benefit.id),
    );

    return {
      product,
      subscription: createPreviewSubscription(product),
      subscriptionStatus: previewSubscriptionStatus,
      benefits,
      redemptions: [],
    };
  });

  // Use the first configured membership as the representative organization-
  // level preview membership. tierSequence controls ordering when it is
  // configured; the display name itself comes from the product's first plan,
  // matching the customer Business Experience projection.
  const selected = memberships[0];

  return {
    subscription: selected?.subscription,
    subscriptionStatus: previewSubscriptionStatus,
    product: selected?.product,
    benefits: selected?.benefits ?? [],
    organizationBenefits,
    offers,
    stores,
    redemptions: [],
    memberships,
    selectedSubscriptionId: selected?.subscription.id ?? "",
    availableMemberships: previewProducts,
    benefitUsageRules,
    offerUsageRules,
  };
}

function withPreviewMembershipDisplayName(
  product: MembershipProduct,
): MembershipProduct {
  /*
   * BusinessExperience uses MembershipProduct.displayName for the customer-
   * facing membership selector and resolveExperience() uses the same product
   * identity for the membership card.
   *
   * The real customer Business Experience builds this display value from the
   * selected subscription plan + the membership product name:
   *
   *   matchedPlan.subscriptionPlanName + product.membershipProductName
   *
   * For example:
   *   SILVER + ARTISAN PASS -> SILVER ARTISAN PASS
   *   GOLD   + ARTISAN PASS -> GOLD ARTISAN PASS
   *
   * The previous preview implementation incorrectly used product.tier. That
   * is not the source used by the real customer renderer, so the preview must
   * follow the same plan-based projection instead.
   *
   * This is preview-only presentation data; the persisted product is never
   * modified.
   */
  const matchedPlan = product.plans[0];
  const planName = matchedPlan?.subscriptionPlanName?.trim();
  const productName = product.membershipProductName?.trim();
  const existingDisplayName = product.displayName?.trim();

  const displayName = [planName, productName].filter(Boolean).join(" ");

  return displayName
    ? {
        ...product,
        displayName,
        plans: matchedPlan
          ? [
              matchedPlan,
              ...product.plans.filter((plan) => plan.id !== matchedPlan.id),
            ]
          : product.plans,
      }
    : existingDisplayName
      ? { ...product, displayName: existingDisplayName }
      : product;
}

function comparePreviewMembershipProducts(
  left: MembershipProduct,
  right: MembershipProduct,
): number {
  const leftSequence = left.tierSequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.tierSequence ?? Number.MAX_SAFE_INTEGER;

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const leftName =
    left.displayName?.trim() || left.membershipProductName.trim();
  const rightName =
    right.displayName?.trim() || right.membershipProductName.trim();

  const byName = leftName.localeCompare(rightName);

  if (byName !== 0) {
    return byName;
  }

  return left.id.localeCompare(right.id);
}

function createPreviewSubscription(product: MembershipProduct): Subscription {
  const now = new Date().toISOString();
  const startDate = product.effectiveDate ?? now;
  const endDate =
    product.expiryDate ??
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `preview-subscription-${product.id}`,
    subscriptionPlanId: product.plans[0]?.id ?? `preview-plan-${product.id}`,
    organizationUserId: `preview-organization-user-${product.organizationId}`,
    subscriptionStatusId: "entity-status-subscription-active",
    subscriptionNumber: `PREVIEW-${product.id}`,
    subscriptionDate: startDate,
    totalAmount: product.plans[0]?.price,
    startDate,
    endDate,
    createdAt: now,
    createdBy: "preview-system",
    updatedAt: now,
    updatedBy: "preview-system",
    isDeleted: false,
    versionNo: 1,
  } as unknown as Subscription;
}

function isActiveStatus(statusId: string, statuses: Status[]): boolean {
  const status = statuses.find((candidate) => candidate.id === statusId);
  return (
    !!status &&
    status.isActive &&
    (status.statusCode.trim().toUpperCase() === "ACTIVE" ||
      status.statusName.trim().toUpperCase() === "ACTIVE")
  );
}

function isCurrentlyEffective(
  effectiveDate?: string,
  expiryDate?: string,
): boolean {
  const now = Date.now();
  const start = effectiveDate
    ? Date.parse(effectiveDate)
    : Number.NEGATIVE_INFINITY;
  const end = expiryDate ? Date.parse(expiryDate) : Number.POSITIVE_INFINITY;
  return (
    !Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end
  );
}
