import type {
  CustomerPreference,
  ID,
  PreferenceType,
  Referral,
  ReferralProgram,
  PhoneNumber,
} from "@/src/core";

export interface CustomerPreferenceService {
  listPreferenceTypes(): Promise<PreferenceType[]>;
  listByUser(userId: ID): Promise<CustomerPreference[]>;
  getValue(userId: ID, preferenceTypeCode: string): Promise<string | null>;
  setValue(
    userId: ID,
    preferenceTypeCode: string,
    value: string,
  ): Promise<CustomerPreference>;
}

export interface CreateReferralInput {
  organizationId: ID;
  referrerUserId: ID;
  referredEmail?: string;
  referredPhone?: PhoneNumber;
}

export interface ReferralService {
  getProgram(organizationId: ID): Promise<ReferralProgram | null>;
  listByReferrer(organizationId: ID, referrerUserId: ID): Promise<Referral[]>;
  createReferral(input: CreateReferralInput): Promise<Referral>;
}
