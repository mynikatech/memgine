import type { ID, OrganizationBranding } from "@/src/core";

import type { BrandingRepository } from "@/src/data/repositories/branding/branding-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";
import { httpClient } from "./http-client";

import {
  OrganizationApiMapper,
  type UpdateOrganizationApiRequest,
} from "./mappers/organization-api-mapper";

type UpdateOrganizationServerResponse = {
  organizationId: string;
};

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
    const request = OrganizationApiMapper.toBrandingUpdateRequest(branding);

    const serverResult = await httpClient.put<
      UpdateOrganizationApiRequest,
      UpdateOrganizationServerResponse
    >(`/api/v1/organizations/update/${organizationId}`, request);

    if (!serverResult.success) {
      return apiFailure(serverResult.error.code, serverResult.error.message);
    }

    try {
      const saved = await this.repository.save(organizationId, branding);

      return apiSuccess(saved);
    } catch (error) {
      return apiFailure(
        "BRANDING_LOCAL_CACHE_UPDATE_FAILED",
        error instanceof Error
          ? error.message
          : "Branding was updated on the server but local cache could not be updated.",
      );
    }
  }
}
