import type { ID } from "@/src/core/domain/common";

import { QRCodeType } from "@/src/core/domain/qr";

import type {
  OfferRedemptionQRContext,
  OfferRedemptionQRResult,
  CreateOfferRedemptionQRInput,
} from "@/src/core/qr/offer-redemption-qr";

import type {
  OfferService,
  OrganizationService,
  StatusService,
} from "./service-contracts";

import type { QRCodeService } from "./qr-code-service";

import type { OfferRedemptionQRContextRepository } from "@/src/data/repositories/offer-redemption-qr-context/offer-redemption-qr-context-repository";

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

export interface OfferRedemptionQRService {
  createQR(
    input: CreateOfferRedemptionQRInput,
  ): Promise<OfferRedemptionQRResult>;

  getByToken(token: string): Promise<OfferRedemptionQRResult | null>;

  deleteQR(qrCodeId: ID): Promise<void>;
}

export class LocalOfferRedemptionQRService implements OfferRedemptionQRService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly offerService: OfferService,
    private readonly statusService: StatusService,
    private readonly qrCodeService: QRCodeService,
    private readonly repository: OfferRedemptionQRContextRepository,
  ) {}

  async createQR(
    input: CreateOfferRedemptionQRInput,
  ): Promise<OfferRedemptionQRResult> {
    const { organizationId, userId, offerId, createdBy } = input;

    const organizationUsers =
      await this.organizationService.listOrganizationUsers(organizationId);

    const organizationUser = organizationUsers.find(
      (item) => item.userId === userId,
    );

    if (!organizationUser) {
      throw new Error("User does not belong to the supplied organization.");
    }

    const offers = await this.offerService.listByOrganization(organizationId);

    const offer = offers.find((item) => item.id === offerId && !item.isDeleted);

    if (!offer) {
      throw new Error(`Offer not found: ${offerId}`);
    }

    /*
     * Stage 5 intentionally does NOT validate:
     * - offer effective date
     * - offer expiry date
     * - inventory/stock
     * - usage rules
     * - usage limits
     * - redemption eligibility
     *
     * Those checks belong to the redemption engine in Stage 6.
     */

    const status = await this.statusService.getStatusByCode("ACTIVE");

    if (!status) {
      throw new Error(
        "Active status could not be resolved for the redemption QR.",
      );
    }

    const now = new Date().toISOString();

    const token = createOpaqueToken();

    const qrCodeId = createId("qr-offer", token);

    const contextId = createId("qr-offer-context", token);

    const qrCode = {
      id: qrCodeId,

      organizationId,

      qrCodeName: "Offer Redemption QR",

      qrCodeTypeId: QRCodeType.OFFER_REDEMPTION,

      qrCodeToken: token,

      targetEntityType: "offer-redemption",

      targetEntityId: offerId,

      createdAt: now,
      createdBy,

      updatedAt: now,
      updatedBy: createdBy,

      statusId: status.id,

      isDeleted: false,
      versionNo: 1,
    };

    const context: OfferRedemptionQRContext = {
      id: contextId,

      qrCodeId: qrCode.id,

      qrCodeToken: qrCode.qrCodeToken,

      organizationId,

      userId,

      offerId,

      createdAt: now,
      createdBy,

      versionNo: 1,
    };

    let createdQRCode;

    try {
      createdQRCode = await this.qrCodeService.createQRCode(qrCode);

      await this.repository.create(context);
    } catch (error) {
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
      qrPath: `/qr/${token}`,
    };
  }

  async getByToken(token: string): Promise<OfferRedemptionQRResult | null> {
    const qrCode = await this.qrCodeService.getByToken(token);

    if (!qrCode) {
      return null;
    }

    if (qrCode.qrCodeTypeId !== QRCodeType.OFFER_REDEMPTION) {
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
