import type { ID, Offer } from "@/src/core";

import type { OfferRepository } from "../repositories/offer/offer-repository";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class OfferApi {
  constructor(private readonly repository: OfferRepository) {}

  async list(organizationId: ID): Promise<ApiResult<Offer[]>> {
    try {
      return apiSuccess(await this.repository.list(organizationId));
    } catch (error) {
      return apiFailure(
        "OFFER_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list offers.",
      );
    }
  }

  async get(organizationId: ID, offerId: ID): Promise<ApiResult<Offer | null>> {
    try {
      return apiSuccess(await this.repository.get(organizationId, offerId));
    } catch (error) {
      return apiFailure(
        "OFFER_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load offer.",
      );
    }
  }

  async create(organizationId: ID, offer: Offer): Promise<ApiResult<Offer>> {
    try {
      return apiSuccess(
        await this.repository.create({
          ...offer,
          organizationId,
        }),
      );
    } catch (error) {
      return apiFailure(
        "OFFER_CREATE_FAILED",
        error instanceof Error ? error.message : "Unable to create offer.",
      );
    }
  }

  async update(organizationId: ID, offer: Offer): Promise<ApiResult<Offer>> {
    try {
      return apiSuccess(await this.repository.update(organizationId, offer));
    } catch (error) {
      return apiFailure(
        "OFFER_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unable to update offer.",
      );
    }
  }

  async delete(organizationId: ID, offerId: ID): Promise<ApiResult<void>> {
    try {
      await this.repository.delete(organizationId, offerId);
      return apiSuccess(undefined);
    } catch (error) {
      return apiFailure(
        "OFFER_DELETE_FAILED",
        error instanceof Error ? error.message : "Unable to delete offer.",
      );
    }
  }
}
