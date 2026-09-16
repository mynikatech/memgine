import type { ID, Organization, OrganizationDetails } from "@/src/core";
import type { CreateOrganizationRepositoryInput } from "@/src/data/repositories/organization/organization-repository";
import { apiFailure, type ApiResult } from "./result";
import { httpClient } from "./http-client";
import {
  OrganizationApiMapper,
  type CreateOrganizationApiRequest,
  type UpdateOrganizationApiRequest,
} from "./mappers/organization-api-mapper";

type CreateOrganizationServerResponse = {
  organizationId: string;
  organizationDetailsId: string;
  organizationBrandingId: string;
};

type UpdateOrganizationServerResponse = {
  organizationId: string;
};

type OrganizationLifecycleServerResponse = {
  organizationId: string;
  organizationStatusId: string;
};

export class OrganizationApi {
  async get(organizationId: ID): Promise<ApiResult<Organization | null>> {
    return httpClient.get<Organization | null>(
      `/api/v1/organizations/get/${organizationId}`,
    );
  }

  async getAggregate(organizationId: ID): Promise<
    ApiResult<{
      organization: Organization;
      details: OrganizationDetails;
      branding: import("@/src/core").OrganizationBranding;
    } | null>
  > {
    return httpClient.get(`/api/v1/organizations/aggregate/${organizationId}`);
  }

  async list(): Promise<ApiResult<Organization[]>> {
    return httpClient.get<Organization[]>("/api/v1/organizations/list");
  }

  async create(
    input: CreateOrganizationRepositoryInput,
  ): Promise<ApiResult<Organization>> {
    const request = OrganizationApiMapper.toCreateRequest(input);

    const serverResult = await httpClient.post<
      CreateOrganizationApiRequest,
      CreateOrganizationServerResponse
    >("/api/v1/organizations/create", request);

    if (!serverResult.success) {
      return apiFailure(serverResult.error.code, serverResult.error.message);
    }

    const created = await this.get(serverResult.data.organizationId);

    if (!created.success) {
      return created;
    }

    if (!created.data) {
      return apiFailure(
        "ORGANIZATION_CREATED_BUT_NOT_FOUND",
        "Organization was created but could not be loaded from the server.",
      );
    }

    return {
      success: true,
      data: created.data,
    };
  }

  async update(
    organizationId: ID,
    organization: Organization,
  ): Promise<ApiResult<Organization>> {
    const request =
      OrganizationApiMapper.toOrganizationUpdateRequest(organization);

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
          code: "ORGANIZATION_UPDATED_BUT_NOT_FOUND",
          message:
            "Organization was updated but could not be loaded from the server.",
        },
      };
    }

    return {
      success: true,
      data: refreshed.data,
    };
  }

  async updateDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<ApiResult<OrganizationDetails>> {
    const request = OrganizationApiMapper.toDetailsUpdateRequest(details);

    const serverResult = await httpClient.put<
      UpdateOrganizationApiRequest,
      UpdateOrganizationServerResponse
    >(`/api/v1/organizations/update/${organizationId}`, request);

    if (!serverResult.success) {
      return apiFailure(serverResult.error.code, serverResult.error.message);
    }

    const refreshed = await this.getDetails(organizationId);

    if (!refreshed.success) {
      return apiFailure(refreshed.error.code, refreshed.error.message);
    }

    if (!refreshed.data) {
      return {
        success: false,
        error: {
          code: "ORGANIZATION_DETAILS_NOT_FOUND",
          message: "Organization details could not be loaded from the server.",
        },
      };
    }

    return {
      success: true,
      data: refreshed.data,
    };
  }

  async getDetails(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationDetails | null>> {
    return httpClient.get<OrganizationDetails | null>(
      `/api/v1/organizations/details/${organizationId}`,
    );
  }

  async activate(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationLifecycleServerResponse>> {
    return httpClient.post<
      Record<string, never>,
      OrganizationLifecycleServerResponse
    >(`/api/v1/organizations/activate/${organizationId}`, {});
  }

  async deactivate(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationLifecycleServerResponse>> {
    return httpClient.post<
      Record<string, never>,
      OrganizationLifecycleServerResponse
    >(`/api/v1/organizations/deactivate/${organizationId}`, {});
  }
}
