import type { ID } from "@/src/core/domain/common";
import type { OfferRedemption } from "@/src/core/domain/offer-redemption";

export interface OfferRedemptionRepository {
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
