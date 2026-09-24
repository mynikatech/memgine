import type { ID } from "@/src/core";

import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type OrganizationAccessStore = {
  storeId: string;
  storeName: string;
};

export type OrganizationAccessStoreAssignment = OrganizationAccessStore & {
  assignmentId: string;
};

export type OrganizationAccessUser = {
  organizationUserId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  membershipStatusId: string;
  membershipStatus: string;
  roles: string[];
  capabilities: string[];
  staffId: string | null;
  staffCode: string | null;
  designation: string | null;
  counterOperatorEnabled: boolean;
  primaryStore: OrganizationAccessStore | null;
  additionalStoreAssignments: OrganizationAccessStoreAssignment[];
  posPinConfigured: boolean;
};

export type SetCounterOperatorRequest = {
  enabled: boolean;
  designation?: string;
  primaryStoreId?: string;
};

export type SetStaffStoresRequest = {
  primaryStoreId?: string;
  additionalStoreIds: string[];
};

export class OrganizationAccessApi {
  private base(organizationId: ID): string {
    return `/api/v1/organizations/${encodeURIComponent(organizationId)}/users-access`;
  }

  async list(organizationId: ID): Promise<ApiResult<OrganizationAccessUser[]>> {
    return httpClient.get(this.base(organizationId));
  }

  async setOrgAdmin(
    organizationId: ID,
    organizationUserId: string,
    enabled: boolean,
  ): Promise<ApiResult<boolean>> {
    return httpClient.put(`${this.base(organizationId)}/${encodeURIComponent(organizationUserId)}/org-admin`, { enabled });
  }

  async setMembership(
    organizationId: ID,
    organizationUserId: string,
    active: boolean,
  ): Promise<ApiResult<boolean>> {
    return httpClient.put(`${this.base(organizationId)}/${encodeURIComponent(organizationUserId)}/membership`, { active });
  }

  async setCounterOperator(
    organizationId: ID,
    organizationUserId: string,
    request: SetCounterOperatorRequest,
  ): Promise<ApiResult<string | null>> {
    return httpClient.put(`${this.base(organizationId)}/${encodeURIComponent(organizationUserId)}/counter-operator`, request);
  }

  async setStores(
    organizationId: ID,
    organizationUserId: string,
    request: SetStaffStoresRequest,
  ): Promise<ApiResult<boolean>> {
    return httpClient.put(`${this.base(organizationId)}/${encodeURIComponent(organizationUserId)}/stores`, request);
  }

  async setPosPin(
    organizationId: ID,
    organizationUserId: string,
    pin: string,
  ): Promise<ApiResult<boolean>> {
    return httpClient.put(`${this.base(organizationId)}/${encodeURIComponent(organizationUserId)}/pos-pin`, { pin });
  }
}
