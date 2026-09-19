import type { ID } from "@/src/core";
import type { Benefit, BenefitUsageRule, MembershipProduct, Offer, Store } from "@/src/core";
import type { CounterPurchaseResult, CounterSubscription } from "./counter-api";
import type { OrgAdminRedemption } from "./org-admin-transaction-api";
import type { CustomerChoice, CustomerProfile } from "@/src/core/services/customer-data-service";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiSuccess, type ApiResult } from "./result";
import { MembershipProductApi } from "./membership-product-api";
import { BenefitApi } from "./benefit-api";
import { OfferApi } from "./offer-api";
import { StoreApi } from "./store-api";

const base = (organizationId: ID) =>
  `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}`;

export class CustomerDataApi {
  choices(): Promise<ApiResult<CustomerChoice[]>> {
    return httpClient.get("/api/v1/customer/dev/choices");
  }

  profiles(_userId?: ID): Promise<ApiResult<CustomerProfile[]>> {
    return httpClient.get("/api/v1/customer/relationships");
  }

  purchase(organizationId: ID, input: {
    planId: ID; customerUserId?: ID; firstName?: string; lastName?: string;
    primaryEmail?: string; primaryPhone?: string;
  }): Promise<ApiResult<CounterPurchaseResult>> {
    const { customerUserId: _customerUserId, ...request } = input;
    return httpClient.post(
      `${base(organizationId)}/purchases`, request,
    );
  }

  preference(organizationId: ID, userId: ID, code: string): Promise<ApiResult<{ value: string | null }>> {
    return httpClient.get(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
    );
  }

  setPreference(organizationId: ID, userId: ID, code: string, value: string): Promise<ApiResult<{ value: string }>> {
    return httpClient.put(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
      { value },
    );
  }

  async subscriptions(organizationId: ID, userId: ID): Promise<ApiResult<CounterSubscription[]>> {
    const result = await httpClient.get<CounterSubscription[]>(
      `${base(organizationId)}/subscriptions`,
    );
    if (!result.success) return result;
    return apiSuccess(await Promise.all(result.data.map(async (row) => ({
      ...row,
      subscriptionStatusId: await entityStatusApi.resolveStatusId(row.subscriptionStatusId),
    }))));
  }

  async redemptions(organizationId: ID, userId: ID): Promise<ApiResult<OrgAdminRedemption[]>> {
    const result = await httpClient.get<OrgAdminRedemption[]>(
      `${base(organizationId)}/history/redemptions`,
    );
    if (!result.success) return result;
    return apiSuccess(await Promise.all(result.data.map(async (row) => ({
      ...row, redemptionStatusId: await entityStatusApi.resolveStatusId(row.redemptionStatusId),
    }))));
  }

  membershipProducts(organizationId: ID, userId?: ID): Promise<ApiResult<MembershipProduct[]>> {
    return new MembershipProductApi().listForCustomer(organizationId, userId);
  }

  benefits(organizationId: ID, userId?: ID): Promise<ApiResult<Benefit[]>> {
    return new BenefitApi().listForCustomer(organizationId, userId);
  }

  async benefitRules(organizationId: ID, userId: ID, benefitId: ID): Promise<BenefitUsageRule[]> {
    return new BenefitApi().rulesForCustomer(organizationId, userId, benefitId);
  }

  offers(organizationId: ID, userId: ID): Promise<ApiResult<Offer[]>> {
    return new OfferApi().listForCustomer(organizationId, userId);
  }

  stores(organizationId: ID, userId: ID): Promise<ApiResult<Store[]>> {
    return new StoreApi().listForCustomer(organizationId, userId);
  }
}
