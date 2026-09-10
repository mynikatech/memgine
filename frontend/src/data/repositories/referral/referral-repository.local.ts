import type { ID, Referral, ReferralProgram } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { ReferralRepository } from "./referral-repository";

export class LocalReferralRepository implements ReferralRepository {
  async getProgram(organizationId: ID): Promise<ReferralProgram | null> {
    return asyncStorageStore.get<ReferralProgram>(
      LOCAL_DATA_KEYS.referralProgram(organizationId),
    );
  }

  async saveProgram(program: ReferralProgram): Promise<ReferralProgram> {
    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.referralProgram(program.organizationId),
      program,
    );
    return program;
  }

  async listByReferrer(
    organizationId: ID,
    referrerUserId: ID,
  ): Promise<Referral[]> {
    const referrals =
      (await asyncStorageStore.get<Referral[]>(
        LOCAL_DATA_KEYS.referrals(organizationId),
      )) ?? [];

    return referrals.filter(
      (item) =>
        !item.isDeleted &&
        item.organizationId === organizationId &&
        item.referrerUserId === referrerUserId,
    );
  }

  async saveReferral(referral: Referral): Promise<Referral> {
    const key = LOCAL_DATA_KEYS.referrals(referral.organizationId);
    const referrals = (await asyncStorageStore.get<Referral[]>(key)) ?? [];

    const index = referrals.findIndex((item) => item.id === referral.id);

    if (index === -1) {
      await asyncStorageStore.set(key, [...referrals, referral]);
    } else {
      referrals[index] = referral;
      await asyncStorageStore.set(key, referrals);
    }

    return referral;
  }
}
