import type { ID, MembershipProduct } from "@/src/core";

export interface MembershipProductRepository {
  list(organizationId: ID): Promise<MembershipProduct[]>;

  get(organizationId: ID, productId: ID): Promise<MembershipProduct | null>;

  create(product: MembershipProduct): Promise<MembershipProduct>;

  update(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct>;

  delete(organizationId: ID, productId: ID): Promise<void>;
}
