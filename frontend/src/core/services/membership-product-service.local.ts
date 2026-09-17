import type { ID, MembershipProduct, OrganizationService } from "@/src/core";
import { apis } from "@/src/data";
import type { MembershipProductService } from "./service-contracts";

export class LocalMembershipProductService implements MembershipProductService {
  constructor(private readonly organizationService: OrganizationService) {}

  async listProducts(organizationId: ID): Promise<MembershipProduct[]> {
    const result = await apis.membershipProduct.list(organizationId);
    if (!result.success) throw new Error(result.error.message);

    return result.data.filter((product) => !product.isDeleted);
  }

  async getProduct(id: ID): Promise<MembershipProduct | null> {
    const organizations = await this.organizationService.listOrganizations();
    for (const organization of organizations) {
      if (organization.isDeleted) continue;
      const result = await apis.membershipProduct.list(organization.id);
      if (!result.success) throw new Error(result.error.message);
      const product = result.data.find(
        (item) => item.id === id && !item.isDeleted,
      );
      if (product) return product;
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
