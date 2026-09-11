import type { BenefitRedemptionQRContext } from "@/src/core/qr/benefit-redemption-qr";
import type { ID } from "@/src/core/domain/common";

export interface BenefitRedemptionQRContextRepository {
  listAll(): Promise<BenefitRedemptionQRContext[]>;

  getById(id: ID): Promise<BenefitRedemptionQRContext | null>;

  getByQRCodeId(qrCodeId: ID): Promise<BenefitRedemptionQRContext | null>;

  create(
    context: BenefitRedemptionQRContext,
  ): Promise<BenefitRedemptionQRContext>;

  delete(id: ID): Promise<void>;
}
