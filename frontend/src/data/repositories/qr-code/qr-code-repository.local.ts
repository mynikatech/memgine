import type { ID, QRCode } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { QRCodeRepository } from "./qr-code-repository";

export class LocalQRCodeRepository implements QRCodeRepository {
  private async listAll(): Promise<QRCode[]> {
    return (
      (await asyncStorageStore.get<QRCode[]>(LOCAL_DATA_KEYS.qrCodes())) ?? []
    );
  }

  async listByOrganization(organizationId: ID): Promise<QRCode[]> {
    const qrCodes = await this.listAll();

    return qrCodes.filter(
      (qrCode) => qrCode.organizationId === organizationId && !qrCode.isDeleted,
    );
  }

  async getById(qrCodeId: ID): Promise<QRCode | null> {
    const qrCodes = await this.listAll();
    const qrCode = qrCodes.find(
      (item) => item.id === qrCodeId && !item.isDeleted,
    );

    return qrCode ?? null;
  }

  async getByToken(qrCodeToken: string): Promise<QRCode | null> {
    const qrCodes = await this.listAll();
    const qrCode = qrCodes.find(
      (item) => item.qrCodeToken === qrCodeToken && !item.isDeleted,
    );

    return qrCode ?? null;
  }

  async create(qrCode: QRCode): Promise<QRCode> {
    const qrCodes = await this.listAll();

    if (qrCodes.some((item) => item.id === qrCode.id)) {
      throw new Error(`QR code already exists: ${qrCode.id}`);
    }

    if (qrCodes.some((item) => item.qrCodeToken === qrCode.qrCodeToken)) {
      throw new Error(`QR code token already exists: ${qrCode.qrCodeToken}`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.qrCodes(), [
      ...qrCodes,
      qrCode,
    ]);

    return qrCode;
  }

  async update(qrCode: QRCode): Promise<QRCode> {
    const qrCodes = await this.listAll();
    const index = qrCodes.findIndex((item) => item.id === qrCode.id);

    if (index === -1) {
      throw new Error(`QR code not found: ${qrCode.id}`);
    }

    const duplicateToken = qrCodes.find(
      (item) =>
        item.qrCodeToken === qrCode.qrCodeToken && item.id !== qrCode.id,
    );

    if (duplicateToken) {
      throw new Error(`QR code token already exists: ${qrCode.qrCodeToken}`);
    }

    qrCodes[index] = qrCode;

    await asyncStorageStore.set(LOCAL_DATA_KEYS.qrCodes(), qrCodes);

    return qrCode;
  }

  async delete(qrCodeId: ID): Promise<void> {
    const qrCodes = await this.listAll();
    const now = new Date().toISOString();

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.qrCodes(),
      qrCodes.map((qrCode) =>
        qrCode.id === qrCodeId
          ? {
              ...qrCode,
              isDeleted: true,
              updatedAt: now,
              versionNo: qrCode.versionNo + 1,
            }
          : qrCode,
      ),
    );
  }
}
