import type { ID, QRMembershipAcquisitionAttribution } from "@/src/core";

export interface QRMembershipAcquisitionAttributionRepository {
  listAll(): Promise<QRMembershipAcquisitionAttribution[]>;
  getByScanHistoryId(
    qrScanHistoryId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null>;
  getBySubscriptionId(
    subscriptionId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null>;
  create(
    attribution: QRMembershipAcquisitionAttribution,
  ): Promise<QRMembershipAcquisitionAttribution>;
}
