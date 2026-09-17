import type { ID } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

export type OrgAdminSubscription = {
  id: ID;
  subscriptionNumber: string;
  organizationUserId: ID;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  subscriptionPlanName: string;
  subscriptionPlanCode: string;
  membershipProductName: string;
  subscriptionDate: string;
  startDate: string;
  endDate: string;
  subscriptionStatusId: ID;
  statusCode: string;
  statusName: string;
  totalAmount: number;
  currencyCode: string;
  createdAt: string;
};

export type OrgAdminRedemption = {
  id: ID;
  redemptionNumber: string;
  subscriptionId: ID;
  subscriptionNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  benefitId: ID;
  benefitName: string;
  benefitCode: string;
  storeId: ID;
  storeName: string;
  storeCode: string;
  staffId?: ID | null;
  staffName?: string | null;
  staffCode?: string | null;
  redemptionDateTime: string;
  quantity: number;
  redemptionStatusId: ID;
  statusCode: string;
  statusName: string;
  remarks?: string | null;
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  updatedBy: ID;
  versionNo: number;
};

export class OrgAdminSubscriptionApi {
  async list(organizationId: ID): Promise<ApiResult<OrgAdminSubscription[]>> {
    try {
      const result = await httpClient.get<OrgAdminSubscription[]>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/subscriptions`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async (row) => ({
        ...row,
        subscriptionStatusId: await entityStatusApi.resolveStatusId(row.subscriptionStatusId),
      }))));
    } catch (error) {
      return apiFailure("SUBSCRIPTION_LIST_FAILED", error instanceof Error ? error.message : "Unable to load subscriptions.");
    }
  }
}

export class OrgAdminRedemptionApi {
  async list(organizationId: ID): Promise<ApiResult<OrgAdminRedemption[]>> {
    try {
      const result = await httpClient.get<OrgAdminRedemption[]>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/redemptions`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async (row) => ({
        ...row,
        redemptionStatusId: await entityStatusApi.resolveStatusId(row.redemptionStatusId),
      }))));
    } catch (error) {
      return apiFailure("REDEMPTION_LIST_FAILED", error instanceof Error ? error.message : "Unable to load redemptions.");
    }
  }
}
