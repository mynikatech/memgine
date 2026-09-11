import type { ID } from "@/src/core/domain/common";
import type { OfferRedemption } from "@/src/core/domain/offer-redemption";
import type { OfferRedemptionRepository } from "../repositories/offer-redemption/offer-redemption-repository";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

/**
 * Transport-facing boundary for Offer Redemption persistence.
 *
 * This is intentionally separate from RedemptionApi, which persists Benefit
 * redemptions.
 */
export class OfferRedemptionApi {
  constructor(private readonly repository: OfferRedemptionRepository) {}

  async listAll(): Promise<ApiResult<OfferRedemption[]>> {
    try {
      return apiSuccess(await this.repository.listAll());
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list offer redemptions.",
      );
    }
  }

  async listByOffer(offerId: ID): Promise<ApiResult<OfferRedemption[]>> {
    try {
      return apiSuccess(await this.repository.listByOffer(offerId));
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list offer redemptions.",
      );
    }
  }

  async listByUser(userId: ID): Promise<ApiResult<OfferRedemption[]>> {
    try {
      return apiSuccess(await this.repository.listByUser(userId));
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list offer redemptions.",
      );
    }
  }

  async listByStore(storeId: ID): Promise<ApiResult<OfferRedemption[]>> {
    try {
      return apiSuccess(await this.repository.listByStore(storeId));
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list offer redemptions.",
      );
    }
  }

  async getById(id: ID): Promise<ApiResult<OfferRedemption | null>> {
    try {
      return apiSuccess(await this.repository.getById(id));
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_GET_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to get offer redemption.",
      );
    }
  }

  async getByRedemptionNumber(
    redemptionNumber: string,
  ): Promise<ApiResult<OfferRedemption | null>> {
    try {
      return apiSuccess(
        await this.repository.getByRedemptionNumber(redemptionNumber),
      );
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_GET_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to get offer redemption.",
      );
    }
  }

  async create(
    redemption: OfferRedemption,
  ): Promise<ApiResult<OfferRedemption>> {
    try {
      return apiSuccess(await this.repository.create(redemption));
    } catch (error) {
      return apiFailure(
        "OFFER_REDEMPTION_CREATE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to create offer redemption.",
      );
    }
  }
}
