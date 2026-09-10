import type { ID, Referral } from "@/src/core";
import type { ReferralService } from "./service-contracts.profile-referral.additions";

export type ReferralSharePayload = {
  referralId: ID;
  referralCode: string;
  message: string;
};

export class ReferralEngine {
  constructor(private readonly service: ReferralService) {}

  async createSharePayload(
    organizationId: ID,
    referrerUserId: ID,
    options?: {
      referredEmail?: string;
      referredPhone?: import("@/src/core").PhoneNumber;
      businessName?: string;
    },
  ): Promise<ReferralSharePayload> {
    const referral = await this.service.createReferral({
      organizationId,
      referrerUserId,
      referredEmail: options?.referredEmail,
      referredPhone: options?.referredPhone,
    });

    const businessName = options?.businessName?.trim() || "this business";

    return {
      referralId: referral.id,
      referralCode: referral.referralCode,
      message:
        `Join me at ${businessName} and enjoy the membership experience. ` +
        `Use my referral code ${referral.referralCode}.`,
    };
  }

  async listMyReferrals(
    organizationId: ID,
    referrerUserId: ID,
  ): Promise<Referral[]> {
    return this.service.listByReferrer(organizationId, referrerUserId);
  }
}
