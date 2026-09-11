import type { ID, QRCode } from "@/src/core";
import type { QRCodeRepository } from "../repositories/qr-code/qr-code-repository";

export class QRCodeApi {
  constructor(private readonly repository: QRCodeRepository) {}

  listByOrganization(organizationId: ID): Promise<QRCode[]> {
    return this.repository.listByOrganization(organizationId);
  }

  getById(qrCodeId: ID): Promise<QRCode | null> {
    return this.repository.getById(qrCodeId);
  }

  getByToken(qrCodeToken: string): Promise<QRCode | null> {
    return this.repository.getByToken(qrCodeToken);
  }

  create(qrCode: QRCode): Promise<QRCode> {
    return this.repository.create(qrCode);
  }

  update(qrCode: QRCode): Promise<QRCode> {
    return this.repository.update(qrCode);
  }

  delete(qrCodeId: ID): Promise<void> {
    return this.repository.delete(qrCodeId);
  }
}
