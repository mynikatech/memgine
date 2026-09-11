import type { ID } from "@/src/core/domain/common";

import type { OfferRedemptionQRContext } from "@/src/core/qr/offer-redemption-qr";

import type { OfferRedemptionQRContextRepository } from "../repositories/offer-redemption-qr-context/offer-redemption-qr-context-repository";

export class OfferRedemptionQRContextApi {
  constructor(
    private readonly repository: OfferRedemptionQRContextRepository,
  ) {}

  listAll(): Promise<OfferRedemptionQRContext[]> {
    return this.repository.listAll();
  }

  getById(id: ID): Promise<OfferRedemptionQRContext | null> {
    return this.repository.getById(id);
  }

  getByQRCodeId(qrCodeId: ID): Promise<OfferRedemptionQRContext | null> {
    return this.repository.getByQRCodeId(qrCodeId);
  }

  create(context: OfferRedemptionQRContext): Promise<OfferRedemptionQRContext> {
    return this.repository.create(context);
  }

  delete(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
