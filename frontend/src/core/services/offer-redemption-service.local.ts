import type { ID } from "@/src/core/domain/common";
import type { OfferRedemption } from "@/src/core/domain/offer-redemption";
import type { OfferRedemptionApi } from "@/src/data/api/offer-redemption-api";

export interface OfferRedemptionService {
  listAll(): Promise<OfferRedemption[]>;
  listByOffer(offerId: ID): Promise<OfferRedemption[]>;
  listByUser(userId: ID): Promise<OfferRedemption[]>;
  listByStore(storeId: ID): Promise<OfferRedemption[]>;
  getById(id: ID): Promise<OfferRedemption | null>;
  getByRedemptionNumber(
    redemptionNumber: string,
  ): Promise<OfferRedemption | null>;
  create(redemption: OfferRedemption): Promise<OfferRedemption>;
}

/**
 * Local implementation of the Offer Redemption service.
 *
 * This service is deliberately independent of Benefit RedemptionService.
 */
export class LocalOfferRedemptionService implements OfferRedemptionService {
  constructor(private readonly api: OfferRedemptionApi) {}

  async listAll(): Promise<OfferRedemption[]> {
    const result = await this.api.listAll();

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async listByOffer(offerId: ID): Promise<OfferRedemption[]> {
    const result = await this.api.listByOffer(offerId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async listByUser(userId: ID): Promise<OfferRedemption[]> {
    const result = await this.api.listByUser(userId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async listByStore(storeId: ID): Promise<OfferRedemption[]> {
    const result = await this.api.listByStore(storeId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async getById(id: ID): Promise<OfferRedemption | null> {
    const result = await this.api.getById(id);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async getByRedemptionNumber(
    redemptionNumber: string,
  ): Promise<OfferRedemption | null> {
    const result = await this.api.getByRedemptionNumber(redemptionNumber);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async create(redemption: OfferRedemption): Promise<OfferRedemption> {
    const result = await this.api.create(redemption);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }
}
