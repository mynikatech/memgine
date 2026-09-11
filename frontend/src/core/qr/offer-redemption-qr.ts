import type { ID, ISODateString } from "@/src/core/domain/common";

import type { QRCode } from "@/src/core/domain/qr";

export interface OfferRedemptionQRContext {
  id: ID;

  qrCodeId: ID;
  qrCodeToken: string;

  organizationId: ID;

  /**
   * Canonical Memgine User identity.
   */
  userId: ID;

  offerId: ID;

  createdAt: ISODateString;
  createdBy: ID;

  versionNo: number;
}

export interface CreateOfferRedemptionQRInput {
  organizationId: ID;
  userId: ID;
  offerId: ID;
  createdBy: ID;
}

export interface OfferRedemptionQRResult {
  qrCode: QRCode;
  context: OfferRedemptionQRContext;
  qrPath: string;
}
