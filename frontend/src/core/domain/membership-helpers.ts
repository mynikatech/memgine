// src/core/domain/membership-helpers.ts

import type { MembershipProduct, SubscriptionPlan } from "./entities";

export function activeMembershipPlanIds(memberships: readonly { planId: string; status?: string | null }[]) {
  return new Set(memberships.filter(({ status }) => status?.toUpperCase() === "ACTIVE").map(({ planId }) => planId));
}

export function discoverableMembershipPlans<T extends { id: string }>(
  plans: readonly T[],
  activePlanIds: ReadonlySet<string>,
): T[] {
  return plans.filter((plan) => !activePlanIds.has(plan.id));
}

export function discoverableMembershipProducts(
  products: readonly MembershipProduct[],
  activePlanIds: ReadonlySet<string>,
): MembershipProduct[] {
  return products.flatMap((product) => {
    const plans = discoverableMembershipPlans(product.plans, activePlanIds);
    return plans.length ? [{ ...product, plans }] : [];
  });
}

export function discoveryMembershipAction(hasActiveMembership: boolean, hasAvailablePlan?: boolean) {
  if (hasAvailablePlan === false) return "View Business";
  return hasActiveMembership ? "Explore More Memberships" : "Explore Memberships";
}

export function resolveJoinPlan(product?: MembershipProduct | null, planId?: string) {
  return planId ? product?.plans.find((plan) => plan.id === planId) : product?.plans[0];
}

/**
 * The public catalog can omit plans that are no longer offered. Restore only
 * the exact owned plan for display, leaving the published product and catalog
 * used for purchase options intact.
 */
export function resolveOwnedMembershipProduct(
  publishedProduct: MembershipProduct | undefined,
  ownedProduct: MembershipProduct | undefined,
  subscriptionPlanId: string,
): MembershipProduct | undefined {
  if (!publishedProduct) return ownedProduct;
  if (publishedProduct.plans.some((plan) => plan.id === subscriptionPlanId)) {
    return publishedProduct;
  }
  const ownedPlan = ownedProduct?.id === publishedProduct.id
    ? ownedProduct.plans.find((plan) => plan.id === subscriptionPlanId)
    : undefined;
  return ownedPlan
    ? { ...publishedProduct, plans: [...publishedProduct.plans, ownedPlan] }
    : publishedProduct;
}

export function getSubscriptionPeriodLabel(plan: SubscriptionPlan): string {
  const unit = plan.subscriptionPeriodUnit.toUpperCase();

  if (plan.subscriptionPeriod === 1 && unit === "MONTH") {
    return "Monthly";
  }

  if (plan.subscriptionPeriod === 12 && unit === "MONTH") {
    return "Yearly";
  }

  if (plan.subscriptionPeriod === 1 && unit === "YEAR") {
    return "Yearly";
  }

  const normalizedUnit =
    unit === "MONTH" ? "month" : unit === "YEAR" ? "year" : unit.toLowerCase();

  return `${plan.subscriptionPeriod} ${normalizedUnit}${
    plan.subscriptionPeriod === 1 ? "" : "s"
  }`;
}
