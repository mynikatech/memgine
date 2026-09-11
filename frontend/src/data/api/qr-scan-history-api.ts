import type { ID, QRScanHistory } from "@/src/core";
import type { QRScanHistoryRepository } from "../repositories/qr-scan-history/qr-scan-history-repository";

export class QRScanHistoryApi {
  constructor(private readonly repository: QRScanHistoryRepository) {}

  listAll(): Promise<QRScanHistory[]> {
    return this.repository.listAll();
  }

  listByQRCode(qrCodeId: ID): Promise<QRScanHistory[]> {
    return this.repository.listByQRCode(qrCodeId);
  }

  listByCustomer(customerId: ID): Promise<QRScanHistory[]> {
    return this.repository.listByCustomer(customerId);
  }

  create(scan: QRScanHistory): Promise<QRScanHistory> {
    return this.repository.create(scan);
  }
}
