import type { ID, MembershipProduct, SubscriptionPlan } from "@/src/core";

import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

type ServerPlan = Omit<SubscriptionPlan, "price"> & {
  price: number;
  currencyCode: string;
};
type ServerProduct = Omit<MembershipProduct, "plans"> & {
  plans: ServerPlan[];
};

export class MembershipProductApi {
  private async fromServer(product: ServerProduct): Promise<MembershipProduct> {
    return {
      ...product,
      productStatusId: await entityStatusApi.resolveStatusId(
        product.productStatusId,
      ),
      plans: await Promise.all(
        product.plans.map(async (plan) => ({
          ...plan,
          price: {
            amountMinor: Math.round(plan.price * 100),
            currency: plan.currencyCode,
          },
          subscriptionPlanStatusId: await entityStatusApi.resolveStatusId(
            plan.subscriptionPlanStatusId,
          ),
        })),
      ),
    };
  }

  private async writeBody(product: MembershipProduct) {
    return {
      id: product.id,
      membershipProductCode: product.membershipProductCode,
      membershipProductName: product.membershipProductName,
      displayName: product.displayName,
      productCategoryId: product.productCategoryId,
      productTypeId: product.productTypeId,
      tier: product.tier,
      tierSequence: product.tierSequence,
      description: product.description,
      productStatusId: await entityStatusApi.resolveEntityStatusId(
        "MEMBERSHIP_PRODUCT", product.productStatusId,
      ),
      effectiveDate: product.effectiveDate,
      expiryDate: product.expiryDate,
      versionNo: product.versionNo,
      benefitIds: product.benefitIds,
      plans: await Promise.all(
        product.plans.filter((plan) => !plan.isDeleted).map(async (plan) => ({
          id: plan.id,
          subscriptionPlanCode: plan.subscriptionPlanCode,
          subscriptionPlanName: plan.subscriptionPlanName,
          description: plan.description,
          subscriptionPeriod: plan.subscriptionPeriod,
          subscriptionPeriodUnit: plan.subscriptionPeriodUnit,
          price: plan.price.amountMinor / 100,
          currencyId: plan.currencyId,
          subscriptionPlanStatusId: await entityStatusApi.resolveEntityStatusId(
            "SUBSCRIPTION_PLAN", plan.subscriptionPlanStatusId,
          ),
          effectiveDate: plan.effectiveDate,
          expiryDate: plan.expiryDate,
          versionNo: plan.versionNo,
        })),
      ),
    };
  }

  async list(organizationId: ID): Promise<ApiResult<MembershipProduct[]>> {
    try {
      const result = await httpClient.get<ServerProduct[]>(
        `/api/v1/organizations/${organizationId}/membership-products`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map((item) => this.fromServer(item))));
    } catch (error) {
      return apiFailure("MEMBERSHIP_PRODUCT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list memberships.");
    }
  }

  async get(organizationId: ID, productId: ID): Promise<ApiResult<MembershipProduct>> {
    try {
      const result = await httpClient.get<ServerProduct>(
        `/api/v1/organizations/${organizationId}/membership-products/${productId}`,
      );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure("MEMBERSHIP_PRODUCT_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load membership.");
    }
  }

  async create(organizationId: ID, product: MembershipProduct): Promise<ApiResult<MembershipProduct>> {
    try {
      const result = await httpClient.post<unknown, ServerProduct>(
        `/api/v1/organizations/${organizationId}/membership-products`,
        await this.writeBody(product),
      );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure("MEMBERSHIP_PRODUCT_CREATE_FAILED",
        error instanceof Error ? error.message : "Unable to create membership.");
    }
  }

  async update(organizationId: ID, product: MembershipProduct): Promise<ApiResult<MembershipProduct>> {
    try {
      const result = await httpClient.put<unknown, ServerProduct>(
        `/api/v1/organizations/${organizationId}/membership-products/${product.id}`,
        await this.writeBody(product),
      );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure("MEMBERSHIP_PRODUCT_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unable to update membership.");
    }
  }

  async delete(organizationId: ID, productId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<{ membershipProductId: ID; deleted: boolean }>(
      `/api/v1/organizations/${organizationId}/membership-products/${productId}`,
    );
    if (!result.success) return result;
    if (!result.data.deleted) {
      return apiFailure("MEMBERSHIP_PRODUCT_DELETE_FAILED", "Membership was not deleted.");
    }
    return apiSuccess(undefined);
  }
}
