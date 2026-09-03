import type { ID, Product } from "@/src/core";

import { apis } from "@/src/data";

import type { ProductService } from "./service-contracts";

export class LocalProductService implements ProductService {
  async listProducts(organizationId: ID): Promise<Product[]> {
    const result = await apis.product.list(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async getProduct(id: ID): Promise<Product | null> {
    /*
     * The ProductService contract currently exposes getProduct
     * as a global lookup.
     *
     * Product dropdowns are organization-scoped and use
     * listProducts(organizationId), so this method is retained
     * for the service contract but is not used by the Benefit form.
     */
    return null;
  }

  async createProduct(organizationId: ID, product: Product): Promise<Product> {
    const result = await apis.product.create(organizationId, product);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async updateProduct(organizationId: ID, product: Product): Promise<Product> {
    const result = await apis.product.update(organizationId, product);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async deleteProduct(organizationId: ID, productId: ID): Promise<void> {
    const result = await apis.product.delete(organizationId, productId);

    if (!result.success) {
      throw new Error(result.error.message);
    }
  }
}
