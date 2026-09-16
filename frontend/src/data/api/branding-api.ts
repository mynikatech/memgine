import type { ID, OrganizationBranding } from "@/src/core";
import { apiFailure, type ApiResult } from "./result";
import { httpClient } from "./http-client";
import {
  OrganizationApiMapper,
  type UpdateOrganizationApiRequest,
} from "./mappers/organization-api-mapper";

type UpdateOrganizationServerResponse = {
  organizationId: string;
};

export class BrandingApi {
  async get(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationBranding | null>> {
    return httpClient.get<OrganizationBranding | null>(
      `/api/v1/organizations/branding/${organizationId}`,
    );
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

    const refreshed = await this.get(organizationId);

    if (!refreshed.success) {
      return refreshed;
    }

    if (!refreshed.data) {
      return {
        success: false,
        error: {
          code: "BRANDING_NOT_FOUND",
          message: "Organization branding could not be loaded from the server.",
        },
      };
    }

    return {
      success: true,
      data: refreshed.data,
    };
  }
}
