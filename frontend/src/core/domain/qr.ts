import type { ID, ISODateString } from "./common";

/**
 * Supported business journeys initiated by a reusable QR Code.
 *
 * The persisted QR Code Type reference data owns the database identifier;
 * these codes provide the application-level vocabulary for the supported
 * journeys.
 */
export enum QRCodeType {
  BUSINESS_MEMBERSHIPS = "QR_BUSINESS_MEMBERSHIPS",
  MEMBERSHIP = "QR_MEMBERSHIP",
  OFFER_REDEMPTION = "QR_OFFER_REDEMPTION",
  BENEFIT_REDEMPTION = "QR_BENEFIT_REDEMPTION",
}

/**
 * Outcome of a QR scan attempt.
 *
 * This is an event outcome, not a lifecycle status for QR Scan History.
 */
export enum QRScanResult {
  SUCCESS = "SUCCESS",
  INVALID = "INVALID",
  EXPIRED = "EXPIRED",
  INACTIVE = "INACTIVE",
  TARGET_NOT_FOUND = "TARGET_NOT_FOUND",
  ACCESS_DENIED = "ACCESS_DENIED",
}

/**
 * Persisted reusable QR Code definition.
 *
 * A QR Code identifies a supported Memgine journey and may optionally
 * identify a target entity such as a Membership Product, Offer or Benefit.
 */
export interface QRCode {
  id: ID;
  organizationId: ID;

  qrCodeName: string;
  qrCodeTypeId: ID;

  /** Opaque public token represented by the generated QR payload. */
  qrCodeToken: string;

  /**
   * Polymorphic target metadata. The QR engine resolves the target according
   * to qrCodeTypeId and these values without coupling QR Code to one domain.
   */
  targetEntityType?: string;
  targetEntityId?: ID;

  /** Optional business-facing placement/campaign label. */
  placementName?: string;

  /** Optional store associated with a physical QR placement. */
  storeId?: ID;

  statusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/**
 * Immutable event record for every QR scan attempt.
 *
 * Customer is optional because membership acquisition QR scans may happen
 * before the customer installs Memgine or signs in.
 */
export interface QRScanHistory {
  id: ID;
  qrCodeId: ID;

  customerId?: ID;

  qrScanDateTime: ISODateString;
  qrScanResultId: ID;

  storeId?: ID;
  staffId?: ID;

  /** Channel through which the QR scan was initiated. */
  scanSource: string;

  /** Target context resolved at scan time, preserved for historical analysis. */
  targetEntityType?: string;
  targetEntityId?: ID;

  /** Populated for unsuccessful scans when additional detail is available. */
  failureReason?: string;

  createdAt: ISODateString;
  createdBy?: ID;

  versionNo: number;
}
