import type { ID } from "@/src/core";

import type {
  CreateOrganizationRepositoryInput,
  OrganizationAggregate,
  OrganizationRepository,
} from "@/src/data/repositories/organization/organization-repository";

import type { Organization, OrganizationDetails } from "@/src/core";

import { apiFailure, apiSuccess, type ApiResult } from "./result";
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

export class OrganizationApi {
  constructor(private readonly repository: OrganizationRepository) {}

  async get(organizationId: ID): Promise<ApiResult<Organization | null>> {
    try {
      return apiSuccess(await this.repository.get(organizationId));
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load organization.",
      );
    }
  }

  async getAggregate(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationAggregate | null>> {
    try {
      return apiSuccess(await this.repository.getAggregate(organizationId));
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_CONTEXT_LOAD_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to load organization context.",
      );
    }
  }

  async list(): Promise<ApiResult<Organization[]>> {
    try {
      return apiSuccess(await this.repository.list());
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list organizations.",
      );
    }
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

    try {
      /*
       * DB is authoritative for creation.
       * Keep the aggregate in the existing local repository only after
       * successful server creation so current list/context screens continue
       * to work while their read APIs are migrated later.
       *
       * OrganizationAccount remains GUI/local-only for the MVP.
       */
      return apiSuccess(await this.repository.create(input));
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_LOCAL_CACHE_FAILED",
        error instanceof Error
          ? error.message
          : "Organization was created on the server but local cache could not be updated.",
      );
    }
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

    try {
      return apiSuccess(
        await this.repository.update(organizationId, organization),
      );
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_LOCAL_CACHE_UPDATE_FAILED",
        error instanceof Error
          ? error.message
          : "Organization was updated on the server but local cache could not be updated.",
      );
    }
  }

  async updateDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<ApiResult<OrganizationDetails>> {
    const request = OrganizationApiMapper.toDetailsUpdateRequest(details);

    const serverResult = await httpClient.put<
      UpdateOrganizationApiRequest,
      UpdateOrganizationServerResponse
    >(`/api/v1/organizations/${organizationId}`, request);

    if (!serverResult.success) {
      return apiFailure(serverResult.error.code, serverResult.error.message);
    }

    try {
      return apiSuccess(
        await this.repository.updateDetails(organizationId, details),
      );
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_DETAILS_LOCAL_CACHE_UPDATE_FAILED",
        error instanceof Error
          ? error.message
          : "Organization details were updated on the server but local cache could not be updated.",
      );
    }
  }

  async getDetails(
    organizationId: ID,
  ): Promise<ApiResult<OrganizationDetails | null>> {
    try {
      const aggregate = await this.repository.getAggregate(organizationId);

      return apiSuccess(aggregate?.details ?? null);
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_DETAILS_LOAD_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to load organization details.",
      );
    }
  }
}
