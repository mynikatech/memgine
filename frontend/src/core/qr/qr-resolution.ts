import type { ID, QRCode } from "@/src/core";
import { QRCodeType, QRScanResult } from "@/src/core/domain/qr";

export type QRResolutionResult =
  | {
      result: QRScanResult.SUCCESS;
      qrCode: QRCode;
    }
  | {
      result:
        | QRScanResult.INVALID
        | QRScanResult.EXPIRED
        | QRScanResult.INACTIVE
        | QRScanResult.TARGET_NOT_FOUND
        | QRScanResult.ACCESS_DENIED;
      qrCode?: QRCode;
      reason: string;
    };

export type QRBusinessMembershipResolution = {
  result: QRScanResult.SUCCESS;
  qrCode: QRCode;
  organizationId: ID;
  membershipProductId?: ID;
};

/**
 * Resolve a persisted QR Code into the business context required by
 * the next journey.
 *
 * The QR URL itself contains only the opaque token.
 *
 * Resolution order:
 *
 *   token
 *     -> QRCode
 *     -> QRCodeType
 *     -> target/context
 *
 * This module deliberately does not contain navigation logic.
 */
export function resolveQRCode(qrCode: QRCode | null): QRResolutionResult {
  if (!qrCode) {
    return {
      result: QRScanResult.INVALID,
      reason: "QR code not found.",
    };
  }

  if (qrCode.isDeleted) {
    return {
      result: QRScanResult.INVALID,
      qrCode,
      reason: "This QR code is no longer available.",
    };
  }

  if (!qrCode.qrCodeToken.trim()) {
    return {
      result: QRScanResult.INVALID,
      qrCode,
      reason: "This QR code has an invalid token.",
    };
  }

  if (!qrCode.qrCodeTypeId.trim()) {
    return {
      result: QRScanResult.INVALID,
      qrCode,
      reason: "This QR code has no configured journey.",
    };
  }

  /*
   * Stage 3 currently supports the business-membership journey.
   *
   * Other QR types are deliberately rejected here rather than silently
   * routing them into an incorrect journey.
   */
  if (qrCode.qrCodeTypeId !== QRCodeType.BUSINESS_MEMBERSHIPS) {
    return {
      result: QRScanResult.ACCESS_DENIED,
      qrCode,
      reason: "This QR journey is not available yet.",
    };
  }

  return {
    result: QRScanResult.SUCCESS,
    qrCode,
  };
}

/**
 * Resolve a successful business-membership QR into the parameters
 * required by the existing JoinFlow.
 *
 * QR_BUSINESS_MEMBERSHIPS represents the organization's membership
 * catalogue, so a product target is optional.
 *
 * If targetEntityType is supplied, it must identify a membership product
 * before targetEntityId is used as productId.
 */
export function resolveBusinessMembershipJourney(
  qrCode: QRCode,
): QRBusinessMembershipResolution {
  if (qrCode.qrCodeTypeId !== QRCodeType.BUSINESS_MEMBERSHIPS) {
    throw new Error("QR code is not a business-membership QR code.");
  }

  const membershipProductId =
    qrCode.targetEntityId &&
    (!qrCode.targetEntityType ||
      qrCode.targetEntityType.toLowerCase() === "membership_product" ||
      qrCode.targetEntityType.toLowerCase() === "membership-product")
      ? qrCode.targetEntityId
      : undefined;

  return {
    result: QRScanResult.SUCCESS,
    qrCode,
    organizationId: qrCode.organizationId,
    membershipProductId,
  };
}
