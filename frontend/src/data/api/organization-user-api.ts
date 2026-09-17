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
}
