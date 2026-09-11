import type { ID, QRScanHistory } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { QRScanHistoryRepository } from "./qr-scan-history-repository";

export class LocalQRScanHistoryRepository implements QRScanHistoryRepository {
  private async listStored(): Promise<QRScanHistory[]> {
    return (
      (await asyncStorageStore.get<QRScanHistory[]>(
        LOCAL_DATA_KEYS.qrScanHistory(),
      )) ?? []
    );
  }

  async listAll(): Promise<QRScanHistory[]> {
    return this.listStored();
  }

  async listByQRCode(qrCodeId: ID): Promise<QRScanHistory[]> {
    const scans = await this.listStored();

    return scans.filter((scan) => scan.qrCodeId === qrCodeId);
  }

  async listByCustomer(customerId: ID): Promise<QRScanHistory[]> {
    const scans = await this.listStored();

    return scans.filter((scan) => scan.customerId === customerId);
  }

  async create(scan: QRScanHistory): Promise<QRScanHistory> {
    const scans = await this.listStored();

    if (scans.some((item) => item.id === scan.id)) {
      throw new Error(`QR scan history already exists: ${scan.id}`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.qrScanHistory(), [
      ...scans,
      scan,
    ]);

    return scan;
  }
}
