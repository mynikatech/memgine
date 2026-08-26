import type { ID, OrganizationBranding } from "@/src/core";

import type { BrandingRepository } from "@/src/data/repositories/branding/branding-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class BrandingApi {
  constructor(private readonly repository: BrandingRepository) {}

  async get(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationBranding | null>> {
    try {
      const branding = await this.repository.getCurrent(organizationId);

      return apiSuccess(branding);
    } catch (error) {
      return apiFailure(
        "BRANDING_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load branding.",
      );
    }
  }

  async update(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<ApiResult<OrganizationBranding>> {
    try {
      const saved = await this.repository.save(organizationId, branding);

      return apiSuccess(saved);
    } catch (error) {
      return apiFailure(
        "BRANDING_SAVE_FAILED",
        error instanceof Error ? error.message : "Unable to save branding.",
      );
    }
  }
}
