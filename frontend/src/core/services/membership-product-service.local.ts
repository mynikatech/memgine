import type { ID, MembershipProduct, OrganizationService } from "@/src/core";
import { apis } from "@/src/data";
import type { MembershipProductService } from "./service-contracts";

export class LocalMembershipProductService implements MembershipProductService {
  constructor(
    private readonly fallback: MembershipProductService,
    private readonly organizationService: OrganizationService,
  ) {}

  async listProducts(organizationId: ID): Promise<MembershipProduct[]> {
    const result = await apis.membershipProduct.list(organizationId);
    if (!result.success) throw new Error(result.error.message);

    const fallbackProducts = await this.fallback.listProducts(organizationId);
    const byId = new Map<string, MembershipProduct>();
    for (const product of fallbackProducts) byId.set(product.id, product);
    for (const product of result.data) byId.set(product.id, product);
    return Array.from(byId.values()).filter((product) => !product.isDeleted);
  }

  async getProduct(id: ID): Promise<MembershipProduct | null> {
    const fallbackProduct = await this.fallback.getProduct(id);
    if (fallbackProduct) return fallbackProduct;

    const organizations = await this.organizationService.listOrganizations();
    for (const organization of organizations) {
      if (organization.isDeleted) continue;
      try {
        const result = await apis.membershipProduct.list(organization.id);
        if (!result.success) continue;
        const product = result.data.find(
          (item) => item.id === id && !item.isDeleted,
        );
        if (product) return product;
      } catch {
        // Continue with the next organization.
      }
    }
    return null;
  }

  async createProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const result = await apis.membershipProduct.create(organizationId, product);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async updateProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const result = await apis.membershipProduct.update(organizationId, product);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async deleteProduct(organizationId: ID, productId: ID): Promise<void> {
    const result = await apis.membershipProduct.delete(
      organizationId,
      productId,
    );
    if (!result.success) throw new Error(result.error.message);
  }
}
