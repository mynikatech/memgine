import type { ID, QRCode } from "@/src/core";
import type { QRCodeApi } from "@/src/data/api/qr-code-api";

export interface QRCodeService {
  listByOrganization(organizationId: ID): Promise<QRCode[]>;
  getById(qrCodeId: ID): Promise<QRCode | null>;
  getByToken(qrCodeToken: string): Promise<QRCode | null>;
  createQRCode(qrCode: QRCode): Promise<QRCode>;
  updateQRCode(qrCode: QRCode): Promise<QRCode>;
  deleteQRCode(qrCodeId: ID): Promise<void>;
}

export class LocalQRCodeService implements QRCodeService {
  constructor(private readonly api: QRCodeApi) {}

  listByOrganization(organizationId: ID) {
    return this.api.listByOrganization(organizationId);
  }

  getById(qrCodeId: ID) {
    return this.api.getById(qrCodeId);
  }

  getByToken(qrCodeToken: string) {
    return this.api.getByToken(qrCodeToken);
  }

  createQRCode(qrCode: QRCode) {
    return this.api.create(qrCode);
  }

  updateQRCode(qrCode: QRCode) {
    return this.api.update(qrCode);
  }

  deleteQRCode(qrCodeId: ID) {
    return this.api.delete(qrCodeId);
  }
}
