import type { ID, Product } from "@/src/core";

import type { ProductRepository } from "../repositories/product/product-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class ProductApi {
  constructor(private readonly repository: ProductRepository) {}

  async list(organizationId: ID): Promise<ApiResult<Product[]>> {
    try {
      return apiSuccess(await this.repository.list(organizationId));
    } catch (error) {
      return apiFailure(
        "PRODUCT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list products.",
      );
    }
  }

  async get(
    organizationId: ID,
    productId: ID,
  ): Promise<ApiResult<Product | null>> {
    try {
      return apiSuccess(await this.repository.get(organizationId, productId));
    } catch (error) {
      return apiFailure(
        "PRODUCT_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load product.",
      );
    }
  }

  async create(
    organizationId: ID,
    product: Product,
  ): Promise<ApiResult<Product>> {
    try {
      return apiSuccess(
        await this.repository.create({
          ...product,
          organizationId,
        }),
      );
    } catch (error) {
      return apiFailure(
        "PRODUCT_CREATE_FAILED",
        error instanceof Error ? error.message : "Unable to create product.",
      );
    }
  }

  async update(
    organizationId: ID,
    product: Product,
  ): Promise<ApiResult<Product>> {
    try {
      return apiSuccess(await this.repository.update(organizationId, product));
    } catch (error) {
      return apiFailure(
        "PRODUCT_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unable to update product.",
      );
    }
  }

  async delete(organizationId: ID, productId: ID): Promise<ApiResult<void>> {
    try {
      await this.repository.delete(organizationId, productId);

      return apiSuccess(undefined);
    } catch (error) {
      return apiFailure(
        "PRODUCT_DELETE_FAILED",
        error instanceof Error ? error.message : "Unable to delete product.",
      );
    }
  }
}
