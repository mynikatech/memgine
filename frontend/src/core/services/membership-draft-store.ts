import type { ID, MembershipProduct } from "@/src/core";

const drafts = new Map<ID, MembershipProduct[]>();

function cloneProducts(products: MembershipProduct[]): MembershipProduct[] {
  return products.map((product) => ({
    ...product,
    benefitIds: [...product.benefitIds],
    plans: product.plans.map((plan) => ({
      ...plan,
      price: { ...plan.price },
    })),
  }));
}

export const membershipDraftStore = {
  get(organizationId: ID): MembershipProduct[] | null {
    const value = drafts.get(organizationId);
    return value ? cloneProducts(value) : null;
  },

  set(organizationId: ID, products: MembershipProduct[]) {
    drafts.set(organizationId, cloneProducts(products));
  },

  clear(organizationId: ID) {
    drafts.delete(organizationId);
  },

  has(organizationId: ID): boolean {
    return drafts.has(organizationId);
  },
};
