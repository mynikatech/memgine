import type { ID, Referral, ReferralProgram } from "@/src/core";
import type { ReferralRepository } from "../repositories/referral/referral-repository";

export class ReferralApi {
  constructor(private readonly repository: ReferralRepository) {}

  getProgram(organizationId: ID): Promise<ReferralProgram | null> {
    return this.repository.getProgram(organizationId);
  }

  saveProgram(program: ReferralProgram): Promise<ReferralProgram> {
    return this.repository.saveProgram(program);
  }

  listByReferrer(organizationId: ID, referrerUserId: ID): Promise<Referral[]> {
    return this.repository.listByReferrer(organizationId, referrerUserId);
  }

  saveReferral(referral: Referral): Promise<Referral> {
    return this.repository.saveReferral(referral);
  }
}
