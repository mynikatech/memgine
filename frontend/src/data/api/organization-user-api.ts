import type { ID, OrganizationUser, User } from "@/src/core";

import { httpClient } from "./http-client";

import {
  OrganizationUserApiMapper,
  type OrganizationUserServerDto,
  type OrganizationUserWithUser,
} from "./mappers/organization-user-api-mapper";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export interface OrganizationUserSnapshot {
  organizationUsers: OrganizationUser[];
  users: User[];
}

export type UpsertOrganizationUserRequest = {
  userId: ID;
  userCode: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  displayName?: string;
  primaryEmail?: string;
  primaryPhone: string;
  organizationUserId: ID;
  organizationUserTypeId: ID;
  joiningDate?: string;
};

export class OrganizationUserApi {
  async list(organizationId: ID): Promise<ApiResult<OrganizationUserSnapshot>> {
    const result = await httpClient.get<OrganizationUserServerDto[]>(
      `/api/v1/organizations/${organizationId}/users`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    const mapped: OrganizationUserWithUser[] = result.data.map((dto) =>
      OrganizationUserApiMapper.fromServer(dto),
    );

    return apiSuccess({
      organizationUsers: mapped.map((item) => item.organizationUser),

      users: mapped.map((item) => item.user),
    });
  }

  async upsert(
    organizationId: ID,
    request: UpsertOrganizationUserRequest,
  ): Promise<ApiResult<unknown>> {
    return httpClient.put<UpsertOrganizationUserRequest, unknown>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/users`,
      request,
    );
  }
}
