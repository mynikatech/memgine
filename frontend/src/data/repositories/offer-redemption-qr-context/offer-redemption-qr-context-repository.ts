import type { ID } from "@/src/core/domain/common";

import type { OfferRedemptionQRContext } from "@/src/core/qr/offer-redemption-qr";

export interface OfferRedemptionQRContextRepository {
  listAll(): Promise<OfferRedemptionQRContext[]>;

  getById(id: ID): Promise<OfferRedemptionQRContext | null>;

  getByQRCodeId(qrCodeId: ID): Promise<OfferRedemptionQRContext | null>;

  create(context: OfferRedemptionQRContext): Promise<OfferRedemptionQRContext>;

  delete(id: ID): Promise<void>;
}
