import type {
  BenefitRedemptionQRContext,
  BenefitRedemptionQRResult,
  CreateBenefitRedemptionQRInput,
} from "@/src/core/qr/benefit-redemption-qr";

import type { ID } from "@/src/core/domain/common";

import { QRCodeType } from "@/src/core/domain/qr";

import type {
  BenefitService,
  OrganizationService,
  StatusService,
  SubscriptionService,
} from "./service-contracts";

import type { QRCodeService } from "./qr-code-service";

import type { BenefitRedemptionQRContextRepository } from "@/src/data/repositories/benefit-redemption-qr-context/benefit-redemption-qr-context-repository";

function createId(prefix: string, token: string): ID {
  return `${prefix}-${Date.now().toString(36)}-${token.slice(0, 12)}`;
}

function createOpaqueToken(): string {
  const bytes = new Uint8Array(16);

  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random token generation is unavailable.");
  }

  globalThis.crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface BenefitRedemptionQRService {
  createQR(
    input: CreateBenefitRedemptionQRInput,
  ): Promise<BenefitRedemptionQRResult>;

  getByToken(token: string): Promise<BenefitRedemptionQRResult | null>;

  deleteQR(qrCodeId: ID): Promise<void>;
}

export class LocalBenefitRedemptionQRService implements BenefitRedemptionQRService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly subscriptionService: SubscriptionService,
    private readonly benefitService: BenefitService,
    private readonly statusService: StatusService,
    private readonly qrCodeService: QRCodeService,
    private readonly repository: BenefitRedemptionQRContextRepository,
  ) {}

  async createQR(
    input: CreateBenefitRedemptionQRInput,
  ): Promise<BenefitRedemptionQRResult> {
    const { organizationId, userId, subscriptionId, benefitIds, createdBy } =
      input;

    const uniqueBenefitIds = Array.from(new Set(benefitIds));

    if (!uniqueBenefitIds.length) {
      throw new Error(
        "At least one benefit is required to create a redemption QR.",
      );
    }

    /*
     * Validate the subscription and its OrganizationUser relationship.
     *
     * IMPORTANT:
     * OrganizationUser.userId is the canonical User identity.
     * We do NOT call CustomerService here.
     */
    const subscription =
      await this.subscriptionService.getSubscription(subscriptionId);

    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const organizationUser = await this.organizationService.getOrganizationUser(
      subscription.organizationUserId,
    );

    if (!organizationUser) {
      throw new Error(
        `Organization user not found: ${subscription.organizationUserId}`,
      );
    }

    if (organizationUser.organizationId !== organizationId) {
      throw new Error(
        "Subscription does not belong to the supplied organization.",
      );
    }

    if (organizationUser.userId !== userId) {
      throw new Error("Subscription does not belong to the supplied user.");
    }

    /*
     * Confirm the selected benefits belong to this organization.
     *
     * We deliberately do NOT perform:
     * - usage-rule validation
     * - usage-limit validation
     * - availability validation
     * - redemption validation
     *
     * Those belong to Stage 6.
     */
    const organizationBenefits =
      await this.benefitService.listByOrganization(organizationId);

    const organizationBenefitIds = new Set(
      organizationBenefits
        .filter((benefit) => !benefit.isDeleted)
        .map((benefit) => benefit.id),
    );

    const invalidBenefitIds = uniqueBenefitIds.filter(
      (benefitId) => !organizationBenefitIds.has(benefitId),
    );

    if (invalidBenefitIds.length) {
      throw new Error(
        `Benefit(s) not found for organization: ${invalidBenefitIds.join(", ")}`,
      );
    }

    const status = await this.statusService.getStatusByCode("ACTIVE");

    if (!status) {
      throw new Error(
        "Active status could not be resolved for the redemption QR.",
      );
    }

    const now = new Date().toISOString();

    const token = createOpaqueToken();

    const qrCodeId = createId("qr-benefit", token);

    const contextId = createId("qr-benefit-context", token);

    const qrCode = {
      id: qrCodeId,
      organizationId,

      qrCodeName: "Benefit Redemption QR",

      qrCodeTypeId: QRCodeType.BENEFIT_REDEMPTION,

      qrCodeToken: token,

      targetEntityType: "subscription-benefit-redemption",

      targetEntityId: subscriptionId,

      createdAt: now,
      createdBy,

      updatedAt: now,
      updatedBy: createdBy,

      statusId: status.id,

      isDeleted: false,
      versionNo: 1,
    };

    const context: BenefitRedemptionQRContext = {
      id: contextId,

      qrCodeId: qrCode.id,

      qrCodeToken: qrCode.qrCodeToken,

      organizationId,

      userId,

      subscriptionId,

      benefitIds: uniqueBenefitIds,

      createdAt: now,
      createdBy,

      versionNo: 1,
    };

    let createdQRCode;

    try {
      createdQRCode = await this.qrCodeService.createQRCode(qrCode);

      await this.repository.create(context);
    } catch (error) {
      /*
       * Avoid leaving an orphaned QR Code if the
       * companion context cannot be persisted.
       */
      try {
        await this.qrCodeService.deleteQRCode(qrCode.id);
      } catch {
        // Best-effort cleanup only.
      }

      throw error;
    }

    return {
      qrCode: createdQRCode,
      context,

      /*
       * This is the route/deep-link target.
       * The current QrPlaceholder remains visual only.
       */
      qrPath: `/qr/${token}`,
    };
  }

  async getByToken(token: string): Promise<BenefitRedemptionQRResult | null> {
    const qrCode = await this.qrCodeService.getByToken(token);

    if (!qrCode) {
      return null;
    }

    if (qrCode.qrCodeTypeId !== QRCodeType.BENEFIT_REDEMPTION) {
      return null;
    }

    const context = await this.repository.getByQRCodeId(qrCode.id);

    if (!context) {
      return null;
    }

    return {
      qrCode,
      context,
      qrPath: `/qr/${qrCode.qrCodeToken}`,
    };
  }

  async deleteQR(qrCodeId: ID): Promise<void> {
    const context = await this.repository.getByQRCodeId(qrCodeId);

    if (context) {
      await this.repository.delete(context.id);
    }

    await this.qrCodeService.deleteQRCode(qrCodeId);
  }
}
