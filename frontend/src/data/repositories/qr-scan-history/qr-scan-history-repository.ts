import type { ID, QRScanHistory } from "@/src/core";

export interface QRScanHistoryRepository {
  listAll(): Promise<QRScanHistory[]>;
  listByQRCode(qrCodeId: ID): Promise<QRScanHistory[]>;
  listByCustomer(customerId: ID): Promise<QRScanHistory[]>;
  create(scan: QRScanHistory): Promise<QRScanHistory>;
}
