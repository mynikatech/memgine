import type { ID } from "@/src/core";

import type {
  CreateOrganizationRepositoryInput,
  OrganizationAggregate,
  OrganizationRepository,
} from "@/src/data/repositories/organization/organization-repository";

import type { Organization } from "@/src/core";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

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
    try {
      return apiSuccess(await this.repository.create(input));
    } catch (error) {
      return apiFailure(
        "ORGANIZATION_CREATE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to create organization.",
      );
    }
  }
}
