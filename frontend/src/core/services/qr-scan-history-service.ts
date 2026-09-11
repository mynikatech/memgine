import type { ID, QRScanHistory } from "@/src/core";
import type { QRScanHistoryApi } from "@/src/data/api/qr-scan-history-api";

export interface QRScanHistoryService {
  listAll(): Promise<QRScanHistory[]>;
  listByQRCode(qrCodeId: ID): Promise<QRScanHistory[]>;
  listByCustomer(customerId: ID): Promise<QRScanHistory[]>;
  recordScan(scan: QRScanHistory): Promise<QRScanHistory>;
}

export class LocalQRScanHistoryService implements QRScanHistoryService {
  constructor(private readonly api: QRScanHistoryApi) {}

  listAll() {
    return this.api.listAll();
  }

  listByQRCode(qrCodeId: ID) {
    return this.api.listByQRCode(qrCodeId);
  }

  listByCustomer(customerId: ID) {
    return this.api.listByCustomer(customerId);
  }

  recordScan(scan: QRScanHistory) {
    return this.api.create(scan);
  }
}
