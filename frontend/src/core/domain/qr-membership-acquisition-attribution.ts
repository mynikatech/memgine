import type { ID, ISODateString } from "./common";

/**
 * Links a successful business-membership QR scan to the subscription created
 * from that acquisition journey.
 *
 * QRScanHistory remains immutable; attribution is stored separately so the
 * scan event itself is never rewritten after it occurs.
 */
export interface QRMembershipAcquisitionAttribution {
  id: ID;

  qrScanHistoryId: ID;
  subscriptionId: ID;

  organizationId: ID;
  membershipProductId: ID;
  customerId?: ID;

  attributedAt: ISODateString;

  createdAt: ISODateString;
  createdBy?: ID;

  versionNo: number;
}
