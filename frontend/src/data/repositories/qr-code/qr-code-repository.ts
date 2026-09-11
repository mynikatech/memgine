import type { ID, QRCode } from "@/src/core";

export interface QRCodeRepository {
  listByOrganization(organizationId: ID): Promise<QRCode[]>;
  getById(qrCodeId: ID): Promise<QRCode | null>;
  getByToken(qrCodeToken: string): Promise<QRCode | null>;
  create(qrCode: QRCode): Promise<QRCode>;
  update(qrCode: QRCode): Promise<QRCode>;
  delete(qrCodeId: ID): Promise<void>;
}
