import type { Benefit, BenefitUsageRule, ID, Product } from "@/src/core";
import { apis } from "@/src/data";
import { benefitOrganizationById } from "@/src/data/api/benefit-api";
import type { BenefitService } from "./service-contracts";

// Retained class name for existing registration; all Benefit data is server-owned.
export class LocalBenefitService implements BenefitService {
  async listByOrganization(organizationId: ID): Promise<Benefit[]> {
    const result = await apis.benefit.list(organizationId);

    if (!result.success) throw new Error(result.error.message);

    return result.data;
  }

  async listByProduct(membershipProductId: ID): Promise<Benefit[]> {
    const result =
      await apis.benefit.listByMembershipProduct(membershipProductId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  listCatalogProducts(organizationId: ID): Promise<Product[]> {
    return apis.benefit.products(organizationId);
  }

  async saveBenefitWithRules(
    organizationId: ID,
    benefit: Benefit,
    rules: BenefitUsageRule[],
  ): Promise<Benefit> {
    const result = await apis.benefit.save(
      organizationId,
      benefit,
      rules,
      !benefitOrganizationById.has(benefit.id),
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async createBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const result = await apis.benefit.create(organizationId, benefit);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async updateBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const result = await apis.benefit.update(organizationId, benefit);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async deleteBenefit(organizationId: ID, benefitId: ID): Promise<void> {
    const result = await apis.benefit.delete(organizationId, benefitId);
    if (!result.success) throw new Error(result.error.message);
  }
}
