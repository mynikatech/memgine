import type {
  ID,
  QRCode,
  QRMembershipAcquisitionAttribution,
  QRScanHistory,
  Subscription,
} from "@/src/core";
import { QRCodeType, QRScanResult } from "@/src/core/domain/qr";
import type {
  MembershipProductService,
  OrganizationService,
} from "./service-contracts";
import type { QRCodeService } from "./qr-code-service";
import type { QRScanHistoryService } from "./qr-scan-history-service";
import type { QRMembershipAcquisitionAttributionApi } from "@/src/data/api/qr-membership-acquisition-attribution-api";

const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface QRMembershipAcquisitionAttributionService {
  attributeSubscription(
    subscription: Subscription,
  ): Promise<QRMembershipAcquisitionAttribution | null>;
}

export class LocalQRMembershipAcquisitionAttributionService implements QRMembershipAcquisitionAttributionService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipProductService: MembershipProductService,
    private readonly qrCodeService: QRCodeService,
    private readonly qrScanHistoryService: QRScanHistoryService,
    private readonly attributionApi: QRMembershipAcquisitionAttributionApi,
  ) {}

  async attributeSubscription(
    subscription: Subscription,
  ): Promise<QRMembershipAcquisitionAttribution | null> {
    const existing = await this.attributionApi.getBySubscriptionId(
      subscription.id,
    );

    if (existing) {
      return existing;
    }

    const organizationUser = await this.organizationService.getOrganizationUser(
      subscription.organizationUserId,
    );

    if (!organizationUser || organizationUser.isDeleted) {
      return null;
    }

    const organizationId = organizationUser.organizationId;
    const customerId = organizationUser.userId;

    const products =
      await this.membershipProductService.listProducts(organizationId);

    const membershipProduct = products.find(
      (product) =>
        !product.isDeleted &&
        product.plans.some(
          (plan) =>
            !plan.isDeleted && plan.id === subscription.subscriptionPlanId,
        ),
    );

    if (!membershipProduct) {
      return null;
    }

    const qrCodes = await this.qrCodeService.listByOrganization(organizationId);
    const qrCodesById = new Map<ID, QRCode>(
      qrCodes.map((qrCode) => [qrCode.id, qrCode]),
    );

    const scans = await this.qrScanHistoryService.listAll();

    const purchaseTime = new Date(subscription.createdAt).getTime();

    if (!Number.isFinite(purchaseTime)) {
      return null;
    }

    const candidates = scans
      .map((scan) => ({
        scan,
        qrCode: qrCodesById.get(scan.qrCodeId),
      }))
      .filter(
        (candidate): candidate is { scan: QRScanHistory; qrCode: QRCode } => {
          const qrCode = candidate.qrCode;

          if (!qrCode) {
            return false;
          }

          return (
            qrCode.qrCodeTypeId === QRCodeType.BUSINESS_MEMBERSHIPS &&
            candidate.scan.qrScanResultId === QRScanResult.SUCCESS &&
            candidate.scan.targetEntityId === membershipProduct.id &&
            isMembershipTarget(candidate.scan.targetEntityType) &&
            isWithinAttributionWindow(
              candidate.scan.qrScanDateTime,
              purchaseTime,
            )
          );
        },
      )
      .sort((left, right) => {
        const leftCustomerMatch = left.scan.customerId === customerId ? 1 : 0;
        const rightCustomerMatch = right.scan.customerId === customerId ? 1 : 0;

        if (leftCustomerMatch !== rightCustomerMatch) {
          return rightCustomerMatch - leftCustomerMatch;
        }

        return (
          new Date(right.scan.qrScanDateTime).getTime() -
          new Date(left.scan.qrScanDateTime).getTime()
        );
      });

    for (const candidate of candidates) {
      const existingScanAttribution =
        await this.attributionApi.getByScanHistoryId(candidate.scan.id);

      if (existingScanAttribution) {
        continue;
      }

      const now = new Date().toISOString();

      return this.attributionApi.create({
        id: `qr-acquisition-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
        qrScanHistoryId: candidate.scan.id,
        subscriptionId: subscription.id,
        organizationId,
        membershipProductId: membershipProduct.id,
        customerId: candidate.scan.customerId ?? customerId,
        attributedAt: now,
        createdAt: now,
        createdBy: subscription.createdBy,
        versionNo: 1,
      });
    }

    return null;
  }
}

function isMembershipTarget(targetEntityType?: string): boolean {
  if (!targetEntityType) {
    return true;
  }

  const normalized = targetEntityType.trim().toLowerCase();

  return (
    normalized === "membership_product" || normalized === "membership-product"
  );
}

function isWithinAttributionWindow(
  scanDateTime: string,
  purchaseTime: number,
): boolean {
  const scanTime = new Date(scanDateTime).getTime();

  if (!Number.isFinite(scanTime)) {
    return false;
  }

  if (scanTime > purchaseTime) {
    return false;
  }

  return purchaseTime - scanTime <= ATTRIBUTION_WINDOW_MS;
}
