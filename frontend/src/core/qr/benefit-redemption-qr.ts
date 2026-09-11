import type { ID, ISODateString } from "@/src/core/domain/common";
import type { QRCode } from "@/src/core/domain/qr";

export interface BenefitRedemptionQRContext {
  id: ID;

  qrCodeId: ID;
  qrCodeToken: string;

  organizationId: ID;

  /**
   * User is the canonical identity in Memgine.
   *
   * There is no separate customer identity used by the
   * redemption QR flow.
   */
  userId: ID;

  subscriptionId: ID;

  /**
   * One customer-presented QR can represent multiple
   * selected benefits.
   */
  benefitIds: ID[];

  createdAt: ISODateString;
  createdBy: ID;

  versionNo: number;
}

export interface CreateBenefitRedemptionQRInput {
  organizationId: ID;
  userId: ID;
  subscriptionId: ID;
  benefitIds: ID[];
  createdBy: ID;
}

export interface BenefitRedemptionQRResult {
  qrCode: QRCode;
  context: BenefitRedemptionQRContext;

  /**
   * Application/deep-link path represented by this QR.
   *
   * The current UI may display a visual placeholder;
   * actual QR image rendering/scanning is handled separately.
   */
  qrPath: string;
}
