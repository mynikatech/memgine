import type { ID, CustomerPreference, PreferenceType } from "@/src/core";

export interface CustomerPreferenceRepository {
  listPreferenceTypes(): Promise<PreferenceType[]>;
  getByUserAndType(
    userId: ID,
    preferenceTypeId: ID,
  ): Promise<CustomerPreference | null>;
  listByUser(userId: ID): Promise<CustomerPreference[]>;
  save(preference: CustomerPreference): Promise<CustomerPreference>;
}
