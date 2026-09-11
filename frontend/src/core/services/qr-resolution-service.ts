import type { ID, QRCode } from "@/src/core";
import { QRScanResult } from "@/src/core/domain/qr";
import type {
  QRBusinessMembershipResolution,
  QRResolutionResult,
} from "@/src/core/qr/qr-resolution";
import {
  resolveBusinessMembershipJourney,
  resolveQRCode,
} from "@/src/core/qr/qr-resolution";
import type { QRCodeService } from "./qr-code-service";
import type { QRScanHistoryService } from "./qr-scan-history-service";

export type QRScanContext = {
  customerId?: ID;
  storeId?: ID;
  staffId?: ID;
  scanSource: string;
  createdBy?: ID;
};

export interface QRResolutionService {
  resolveByToken(token: string): Promise<QRResolutionResult>;

  resolveBusinessMembershipByToken(
    token: string,
  ): Promise<QRBusinessMembershipResolution>;

  recordScan(
    qrCode: QRCode | undefined,
    result: QRScanResult,
    context: QRScanContext,
    failureReason?: string,
  ): Promise<void>;
}

/**
 * Application service for QR resolution.
 *
 * This service coordinates the persisted QR Code and scan-history
 * services, while keeping navigation/UI concerns outside the core.
 */
export class LocalQRResolutionService implements QRResolutionService {
  constructor(
    private readonly qrCodeService: QRCodeService,
    private readonly qrScanHistoryService: QRScanHistoryService,
  ) {}

  async resolveByToken(token: string): Promise<QRResolutionResult> {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return {
        result: QRScanResult.INVALID,
        reason: "QR code token is required.",
      };
    }

    const qrCode = await this.qrCodeService.getByToken(normalizedToken);

    return resolveQRCode(qrCode);
  }

  async resolveBusinessMembershipByToken(
    token: string,
  ): Promise<QRBusinessMembershipResolution> {
    const resolution = await this.resolveByToken(token);

    if (resolution.result !== QRScanResult.SUCCESS) {
      throw new Error(resolution.reason);
    }

    return resolveBusinessMembershipJourney(resolution.qrCode);
  }

  async recordScan(
    qrCode: QRCode | undefined,
    result: QRScanResult,
    context: QRScanContext,
    failureReason?: string,
  ): Promise<void> {
    /*
     * There is no QR Code to reference when token parsing itself fails.
     * Scan history currently requires qrCodeId, so there is nothing
     * safe to persist in that case.
     */
    if (!qrCode) {
      return;
    }

    const now = new Date().toISOString();

    await this.qrScanHistoryService.recordScan({
      id: `qr-scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      qrCodeId: qrCode.id,
      customerId: context.customerId,
      qrScanDateTime: now,
      qrScanResultId: result,
      storeId: context.storeId ?? qrCode.storeId,
      staffId: context.staffId,
      scanSource: context.scanSource,
      targetEntityType: qrCode.targetEntityType,
      targetEntityId: qrCode.targetEntityId,
      failureReason,
      createdAt: now,
      createdBy: context.createdBy,
      versionNo: 1,
    });
  }
}
