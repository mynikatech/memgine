import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Status,
  Store,
  Subscription,
} from "@/src/core";

import { services } from "@/src/core";

/**
 * Synthetic membership state used only by the administrator preview.
 *
 * This is deliberately NOT linked to an OrganizationUser or a real
 * customer subscription.
 */
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
};

/**
 * Loads organization-owned configuration/data for the preview and creates
 * synthetic customer state where the customer renderer requires a
 * subscription.
 *
 * IMPORTANT:
 * - No organization users are loaded.
 * - No real customer subscriptions are loaded.
 * - No real customer redemption history is loaded.
 * - Every configured membership product gets its own synthetic subscription.
 * - Membership order is the order returned by membershipProduct.listProducts().
 *   There is intentionally no Gold/Silver/Platinum hard-coding.
 */
export async function loadPreviewData(
  organizationId: string,
): Promise<PreviewDomainData> {
  const [products, offers, stores, organizationBenefits] = await Promise.all([
    services.membershipProduct.listProducts(organizationId),
    services.offer.listByOrganization(organizationId),
    services.organization.listStores(organizationId),
    services.benefit.listByOrganization(organizationId),
  ]);

  const memberships: PreviewMembership[] = [];

  for (const product of products) {
    const benefits = await services.benefit.listByProduct(product.id);

    memberships.push({
      product,
      subscription: createPreviewSubscription(product),
      benefits,
      redemptions: createPreviewRedemptions(product, benefits, stores),
    });
  }

  const previewOffers = offers.filter((offer) => !offer.isDeleted);
  const selected = memberships[0];

  return {
    subscription: selected?.subscription,
    subscriptionStatus: selected?.subscriptionStatus,
    product: selected?.product,
    benefits: selected?.benefits ?? [],
    organizationBenefits,
    offers: previewOffers,
    stores,
    redemptions: selected?.redemptions ?? [],
    memberships,
    selectedSubscriptionId: selected?.subscription.id ?? "",
    availableMemberships: memberships.map((membership) => membership.product),
  };
}

function createPreviewSubscription(product: MembershipProduct): Subscription {
  const now = new Date().toISOString();

  return {
    id: `preview-subscription-${product.id}`,
    subscriptionPlanId: product.plans[0]?.id ?? `preview-plan-${product.id}`,
    organizationUserId: `preview-organization-user-${product.organizationId}`,
    subscriptionStatusId: "entity-status-subscription-active",

    subscriptionNumber: `PREVIEW-${product.id}`,
    subscriptionDate: now,
    totalAmount: product.plans[0]?.price,

    startDate: now,
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),

    createdAt: now,
    createdBy: "preview-system",
    updatedAt: now,
    updatedBy: "preview-system",
    isDeleted: false,
    versionNo: 1,
  } as unknown as Subscription;
}

/**
 * Deterministic mock redemption state for the preview.
 *
 * It is generated per membership product, so changing Gold/Silver/Platinum
 * changes the benefit/redemption state with the selected membership instead
 * of sharing one customer's redemption history across all tabs.
 */
function createPreviewRedemptions(
  product: MembershipProduct,
  benefits: Benefit[],
  stores: Store[],
): Redemption[] {
  if (benefits.length < 2 || stores.length === 0) {
    return [];
  }

  const benefit = benefits[1];

  const date = new Date();
  date.setDate(date.getDate() - 7);

  return [
    {
      id: `preview-redemption-${product.id}-${benefit.id}`,
      benefitId: benefit.id,
      storeId: stores[0].id,
      redemptionDateTime: date.toISOString(),
    } as unknown as Redemption,
  ];
}
