import type { ID, MembershipProduct } from "@/src/core";

import { apis } from "@/src/data";

import type { MembershipProductService } from "./service-contracts";

export class LocalMembershipProductService implements MembershipProductService {
  constructor(private readonly fallback: MembershipProductService) {}

  async listProducts(organizationId: ID): Promise<MembershipProduct[]> {
    const result = await apis.membershipProduct.list(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const fallbackProducts = await this.fallback.listProducts(organizationId);

    const byId = new Map<string, MembershipProduct>();

    // Existing demo data first.
    for (const product of fallbackProducts) {
      byId.set(product.id, product);
    }

    // Persisted local data overrides demo data.
    for (const product of result.data) {
      byId.set(product.id, product);
    }

    // A locally deleted product hides the fallback version.
    return Array.from(byId.values()).filter((product) => !product.isDeleted);
  }

  async getProduct(id: ID): Promise<MembershipProduct | null> {
    /*
     * The existing service contract exposes getProduct(id)
     * without an organizationId.
     *
     * The organization-scoped local API therefore cannot be
     * called safely here without inventing an organization.
     *
     * Keep the existing lookup behavior through the fallback
     * until a global membership-product lookup is introduced
     * at the repository/API layer.
     */
    return this.fallback.getProduct(id);
  }

  async createProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const result = await apis.membershipProduct.create(organizationId, product);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async updateProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const result = await apis.membershipProduct.update(organizationId, product);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async deleteProduct(organizationId: ID, productId: ID): Promise<void> {
    const result = await apis.membershipProduct.delete(
      organizationId,
      productId,
    );

    if (!result.success) {
      throw new Error(result.error.message);
    }
  }
}
