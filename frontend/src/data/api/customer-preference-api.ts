import type { ID, CustomerPreference, PreferenceType } from "@/src/core";
import type { CustomerPreferenceRepository } from "../repositories/customer-preference/customer-preference-repository";

export class CustomerPreferenceApi {
  constructor(private readonly repository: CustomerPreferenceRepository) {}

  listPreferenceTypes(): Promise<PreferenceType[]> {
    return this.repository.listPreferenceTypes();
  }

  getByUserAndType(
    userId: ID,
    preferenceTypeId: ID,
  ): Promise<CustomerPreference | null> {
    return this.repository.getByUserAndType(userId, preferenceTypeId);
  }

  listByUser(userId: ID): Promise<CustomerPreference[]> {
    return this.repository.listByUser(userId);
  }

  save(preference: CustomerPreference): Promise<CustomerPreference> {
    return this.repository.save(preference);
  }
}
