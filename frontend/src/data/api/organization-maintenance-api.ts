import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type AdministrativeRoleCode = "BUSINESS_OWNER" | "ORG_ADMIN";

export type OrganizationAdministrativeUser = {
  assignmentId: string;
  organizationUserId: string;
  organizationId: string;
  userId: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  primaryEmail?: string;
  primaryPhone: string;
  roleCode: AdministrativeRoleCode;
  assignmentStatusId: string;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type SaveOrganizationAdministrativeUser = {
  firstName: string;
  lastName?: string;
  primaryEmail?: string;
  primaryPhone: string;
  roleCode: AdministrativeRoleCode;
  effectiveFrom?: string;
  effectiveTo?: string;
};

export class OrganizationMaintenanceApi {
  list(
    organizationId: string,
  ): Promise<ApiResult<OrganizationAdministrativeUser[]>> {
    return httpClient.get(
      `/api/v1/platform/organizations/${encodeURIComponent(organizationId)}/administrative-users`,
    );
  }

  create(
    organizationId: string,
    request: SaveOrganizationAdministrativeUser,
  ): Promise<ApiResult<OrganizationAdministrativeUser>> {
    return httpClient.post(
      `/api/v1/platform/organizations/${encodeURIComponent(organizationId)}/administrative-users`,
      request,
    );
  }

  update(
    organizationId: string,
    userId: string,
    request: SaveOrganizationAdministrativeUser,
  ): Promise<ApiResult<OrganizationAdministrativeUser>> {
    return httpClient.put(
      `/api/v1/platform/organizations/${encodeURIComponent(organizationId)}/administrative-users/${encodeURIComponent(userId)}`,
      request,
    );
  }
}
