import type { Benefit, ID } from "@/src/core";

import { apis } from "@/src/data";

import type { BenefitService } from "./service-contracts";

export class LocalBenefitService implements BenefitService {
  constructor(private readonly fallback: BenefitService) {}

  async listByOrganization(organizationId: ID): Promise<Benefit[]> {
    const result = await apis.benefit.list(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const fallbackBenefits =
      await this.fallback.listByOrganization(organizationId);

    const byId = new Map<string, Benefit>();

    // Existing demo data first.
    for (const benefit of fallbackBenefits) {
      byId.set(benefit.id, benefit);
    }

    // Persisted local data overrides demo data.
    for (const benefit of result.data) {
      byId.set(benefit.id, benefit);
    }

    // A locally deleted benefit hides the fallback version.
    return Array.from(byId.values()).filter((benefit) => !benefit.isDeleted);
  }

  async listByProduct(membershipProductId: ID): Promise<Benefit[]> {
    /*
     * The existing service contract exposes listByProduct()
     * with only the membership product ID.
     *
     * The local membership-product API is organization-scoped,
     * so we cannot safely resolve the local product here without
     * an organization context.
     *
     * Preserve the existing service behavior through the
     * fallback until a global lookup/context is introduced.
     */
    const fallbackBenefits =
      await this.fallback.listByProduct(membershipProductId);

    return fallbackBenefits.filter((benefit) => !benefit.isDeleted);
  }

  async createBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const result = await apis.benefit.create(organizationId, benefit);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async updateBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const result = await apis.benefit.update(organizationId, benefit);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async deleteBenefit(organizationId: ID, benefitId: ID): Promise<void> {
    const result = await apis.benefit.delete(organizationId, benefitId);

    if (!result.success) {
      throw new Error(result.error.message);
    }
  }
}
