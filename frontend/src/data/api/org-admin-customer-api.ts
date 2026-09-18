import type { ID } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

export type OrgAdminCustomer = {
  organizationUserId: ID;
  userId: ID;
  userCode: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  primaryEmail?: string | null;
  primaryPhone: string;
  userStatusId: ID;
  userStatusName: string;
  organizationUserTypeId: ID;
  organizationUserStatusId: ID;
  relationshipStatusName: string;
  joiningDate: string;
  subscriptionCount: number;
  membershipName?: string | null;
};

export type CreateOrgAdminProspect = {
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName?: string;
  primaryEmail?: string;
  primaryPhone: string;
};

export class OrgAdminCustomerApi {
  async list(organizationId: ID): Promise<ApiResult<OrgAdminCustomer[]>> {
    try {
      const result = await httpClient.get<OrgAdminCustomer[]>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/customers`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async (customer) => ({
        ...customer,
        userStatusId: await entityStatusApi.resolveStatusId(customer.userStatusId),
        organizationUserStatusId: await entityStatusApi.resolveStatusId(customer.organizationUserStatusId),
      }))));
    } catch (error) {
      return apiFailure("CUSTOMER_LIST_FAILED", error instanceof Error ? error.message : "Unable to load customers.");
    }
  }

  async createProspect(organizationId: ID, prospect: CreateOrgAdminProspect): Promise<ApiResult<ID>> {
    const result = await httpClient.post<CreateOrgAdminProspect, { organizationUserId: ID }>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/customers/prospects`, prospect,
    );
    return result.success ? apiSuccess(result.data.organizationUserId) : result;
  }
}
