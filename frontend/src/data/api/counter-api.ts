import type { ID } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";
import type { OrgAdminCustomer } from "./org-admin-customer-api";
import type { OrgAdminRedemption, OrgAdminSubscription } from "./org-admin-transaction-api";

export type CounterContext = { organizationId: ID; storeId: ID; staffId: ID };
export type CounterSubscription = OrgAdminSubscription & {
  userId: ID; subscriptionPlanId: ID; membershipProductId: ID;
};
export type CounterPurchase = {
  storeId: ID; staffId: ID; planId: ID; customerUserId?: ID;
  firstName?: string; lastName?: string; primaryEmail?: string; primaryPhone?: string;
};
export type CounterPurchaseResult = {
  subscriptionId: ID; organizationUserId: ID; userId: ID;
  subscriptionNumber: string; subscriptionPlanId: ID; subscriptionDate: string;
  startDate: string; endDate: string; subscriptionStatusId: ID;
  totalAmount: number; currencyCode: string;
};
export type CounterRedemption = { redemptionId: ID; benefitId: ID; redemptionNumber: string };
export type CounterEligibility = { benefitId: ID; reason?: string | null };
export type CounterQr = {
  token: string; qrCodeTypeId: string; subscriptionId: ID;
  customerUserId: ID; customerName: string;
};

export class CounterApi {
  private path(ctx: CounterContext, suffix: string) {
    return `/api/v1/organizations/${encodeURIComponent(ctx.organizationId)}/counter/${suffix}`;
  }
  private query(ctx: CounterContext, suffix: string) {
    return `${this.path(ctx, suffix)}?storeId=${encodeURIComponent(ctx.storeId)}&staffId=${encodeURIComponent(ctx.staffId)}`;
  }
  async customers(ctx: CounterContext): Promise<ApiResult<OrgAdminCustomer[]>> {
    try {
      const result = await httpClient.get<OrgAdminCustomer[]>(this.query(ctx, "customers"));
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async row => ({
        ...row,
        userStatusId: await entityStatusApi.resolveStatusId(row.userStatusId),
        organizationUserStatusId: await entityStatusApi.resolveStatusId(row.organizationUserStatusId),
      }))));
    } catch (error) {
      return apiFailure("COUNTER_CUSTOMERS_FAILED", error instanceof Error ? error.message : "Unable to load customers");
    }
  }
  async subscriptions(ctx: CounterContext): Promise<ApiResult<CounterSubscription[]>> {
    try {
      const result = await httpClient.get<CounterSubscription[]>(this.query(ctx, "subscriptions"));
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async row => ({
        ...row, subscriptionStatusId: await entityStatusApi.resolveStatusId(row.subscriptionStatusId),
      }))));
    } catch (error) {
      return apiFailure("COUNTER_SUBSCRIPTIONS_FAILED", error instanceof Error ? error.message : "Unable to load subscriptions");
    }
  }
  async redemptions(ctx: CounterContext): Promise<ApiResult<OrgAdminRedemption[]>> {
    try {
      const result = await httpClient.get<OrgAdminRedemption[]>(this.query(ctx, "redemptions"));
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map(async row => ({
        ...row, redemptionStatusId: await entityStatusApi.resolveStatusId(row.redemptionStatusId),
      }))));
    } catch (error) {
      return apiFailure("COUNTER_REDEMPTIONS_FAILED", error instanceof Error ? error.message : "Unable to load redemptions");
    }
  }
  qrSamples(ctx: CounterContext): Promise<ApiResult<CounterQr[]>> {
    return httpClient.get(this.query(ctx, "qr-samples"));
  }
  staffName(ctx: CounterContext): Promise<ApiResult<string | null>> {
    return httpClient.get(this.query(ctx, "staff-name"));
  }
  eligibility(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]): Promise<ApiResult<CounterEligibility[]>> {
    return httpClient.post(this.path(ctx, "eligibility"), {
      storeId: ctx.storeId, staffId: ctx.staffId, subscriptionId, benefitIds,
    });
  }
  purchase(ctx: CounterContext, request: Omit<CounterPurchase, "storeId" | "staffId">): Promise<ApiResult<CounterPurchaseResult>> {
    return httpClient.post(this.path(ctx, "purchases"), {
      ...request, storeId: ctx.storeId, staffId: ctx.staffId,
    });
  }
  redeem(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]): Promise<ApiResult<CounterRedemption[]>> {
    return httpClient.post(this.path(ctx, "redemptions"), {
      storeId: ctx.storeId, staffId: ctx.staffId, subscriptionId, benefitIds,
    });
  }
  redeemQr(ctx: CounterContext, token: string): Promise<ApiResult<CounterRedemption[]>> {
    return httpClient.post(this.path(ctx, "qr-redemptions"), {
      storeId: ctx.storeId, staffId: ctx.staffId, token,
    });
  }
}
