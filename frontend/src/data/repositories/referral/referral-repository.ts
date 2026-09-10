import type { ID, Referral, ReferralProgram } from "@/src/core";

export interface ReferralRepository {
  getProgram(organizationId: ID): Promise<ReferralProgram | null>;
  saveProgram(program: ReferralProgram): Promise<ReferralProgram>;
  listByReferrer(organizationId: ID, referrerUserId: ID): Promise<Referral[]>;
  saveReferral(referral: Referral): Promise<Referral>;
}
