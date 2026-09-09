import type { ID } from "@/src/core";
import type { Redemption } from "@/src/core";
import type { RedemptionRepository } from "../repositories/redemption/redemption-repository";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

/**
 * Transport-facing boundary for redemption persistence.
 * Today it is backed by the local repository. A server repository can replace
 * it later without changing the service or redemption engine contracts.
 */
export class RedemptionApi {
  constructor(private readonly repository: RedemptionRepository) {}

  async listBySubscription(
    subscriptionId: ID,
  ): Promise<ApiResult<Redemption[]>> {
    try {
      return apiSuccess(
        await this.repository.listBySubscription(subscriptionId),
      );
    } catch (error) {
      return apiFailure(
        "REDEMPTION_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list redemptions.",
      );
    }
  }

  async create(redemption: Redemption): Promise<ApiResult<Redemption>> {
    try {
      return apiSuccess(await this.repository.create(redemption));
    } catch (error) {
      return apiFailure(
        "REDEMPTION_CREATE_FAILED",
        error instanceof Error ? error.message : "Unable to create redemption.",
      );
    }
  }
}
