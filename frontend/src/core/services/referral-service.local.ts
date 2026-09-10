import type { ID, Referral, ReferralProgram } from "@/src/core";
import type {
  CreateReferralInput,
  ReferralService,
} from "./service-contracts.profile-referral.additions";
import type { ReferralApi } from "@/src/data/api/referral-api";

function makeReferralCode(organizationId: ID, userId: ID): string {
  const org = organizationId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 5)
    .toUpperCase();
  const user = userId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-5)
    .toUpperCase();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `MG-${org}-${user}-${suffix}`;
}

export class LocalReferralService implements ReferralService {
  constructor(private readonly api: ReferralApi) {}

  getProgram(organizationId: ID): Promise<ReferralProgram | null> {
    return this.api.getProgram(organizationId);
  }

  listByReferrer(organizationId: ID, referrerUserId: ID): Promise<Referral[]> {
    return this.api.listByReferrer(organizationId, referrerUserId);
  }

  async createReferral(input: CreateReferralInput): Promise<Referral> {
    const program = await this.api.getProgram(input.organizationId);

    if (!program || program.isDeleted) {
      throw new Error("Referral program is not configured for this business.");
    }

    const now = new Date().toISOString();

    return this.api.saveReferral({
      id: `REF-${Date.now().toString(36).toUpperCase()}`,
      organizationId: input.organizationId,
      referralProgramId: program.id,
      referrerUserId: input.referrerUserId,
      referralCode: makeReferralCode(
        input.organizationId,
        input.referrerUserId,
      ),
      referredEmail: input.referredEmail?.trim() || undefined,
      referredPhone: input.referredPhone,
      referralStatusId: "referral-status-created",
      createdAt: now,
      createdBy: input.referrerUserId,
      updatedAt: now,
      updatedBy: input.referrerUserId,
      isDeleted: false,
      versionNo: 1,
    });
  }
}
