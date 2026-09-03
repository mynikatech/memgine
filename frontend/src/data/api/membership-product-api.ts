import type { ID, MembershipProduct } from "@/src/core";

import type { MembershipProductRepository } from "../repositories/membership/membership-product-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class MembershipProductApi {
  constructor(private readonly repository: MembershipProductRepository) {}

  async list(organizationId: ID): Promise<ApiResult<MembershipProduct[]>> {
    try {
      return apiSuccess(await this.repository.list(organizationId));
    } catch (error) {
      return apiFailure(
        "MEMBERSHIP_PRODUCT_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list membership products.",
      );
    }
  }

  async get(
    organizationId: ID,
    productId: ID,
  ): Promise<ApiResult<MembershipProduct | null>> {
    try {
      return apiSuccess(await this.repository.get(organizationId, productId));
    } catch (error) {
      return apiFailure(
        "MEMBERSHIP_PRODUCT_LOAD_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to load membership product.",
      );
    }
  }

  async create(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<ApiResult<MembershipProduct>> {
    try {
      return apiSuccess(
        await this.repository.create({
          ...product,
          organizationId,
        }),
      );
    } catch (error) {
      return apiFailure(
        "MEMBERSHIP_PRODUCT_CREATE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to create membership product.",
      );
    }
  }

  async update(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<ApiResult<MembershipProduct>> {
    try {
      return apiSuccess(await this.repository.update(organizationId, product));
    } catch (error) {
      return apiFailure(
        "MEMBERSHIP_PRODUCT_UPDATE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to update membership product.",
      );
    }
  }

  async delete(organizationId: ID, productId: ID): Promise<ApiResult<void>> {
    try {
      await this.repository.delete(organizationId, productId);

      return apiSuccess(undefined);
    } catch (error) {
      return apiFailure(
        "MEMBERSHIP_PRODUCT_DELETE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to delete membership product.",
      );
    }
  }
}
