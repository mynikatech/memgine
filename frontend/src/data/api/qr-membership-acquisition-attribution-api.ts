import type { ID, QRMembershipAcquisitionAttribution } from "@/src/core";
import type { QRMembershipAcquisitionAttributionRepository } from "../repositories/qr-membership-acquisition-attribution/qr-membership-acquisition-attribution-repository";

export class QRMembershipAcquisitionAttributionApi {
  constructor(
    private readonly repository: QRMembershipAcquisitionAttributionRepository,
  ) {}

  listAll(): Promise<QRMembershipAcquisitionAttribution[]> {
    return this.repository.listAll();
  }

  getByScanHistoryId(
    qrScanHistoryId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null> {
    return this.repository.getByScanHistoryId(qrScanHistoryId);
  }

  getBySubscriptionId(
    subscriptionId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null> {
    return this.repository.getBySubscriptionId(subscriptionId);
  }

  create(
    attribution: QRMembershipAcquisitionAttribution,
  ): Promise<QRMembershipAcquisitionAttribution> {
    return this.repository.create(attribution);
  }
}
