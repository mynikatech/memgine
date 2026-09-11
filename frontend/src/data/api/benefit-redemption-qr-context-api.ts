import type { ID } from "@/src/core/domain/common";
import type { BenefitRedemptionQRContext } from "@/src/core/qr/benefit-redemption-qr";

import type { BenefitRedemptionQRContextRepository } from "../repositories/benefit-redemption-qr-context/benefit-redemption-qr-context-repository";

export class BenefitRedemptionQRContextApi {
  constructor(
    private readonly repository: BenefitRedemptionQRContextRepository,
  ) {}

  listAll(): Promise<BenefitRedemptionQRContext[]> {
    return this.repository.listAll();
  }

  getById(id: ID): Promise<BenefitRedemptionQRContext | null> {
    return this.repository.getById(id);
  }

  getByQRCodeId(qrCodeId: ID): Promise<BenefitRedemptionQRContext | null> {
    return this.repository.getByQRCodeId(qrCodeId);
  }

  create(
    context: BenefitRedemptionQRContext,
  ): Promise<BenefitRedemptionQRContext> {
    return this.repository.create(context);
  }

  delete(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
