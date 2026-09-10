import type { ID, CustomerPreference, PreferenceType } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { CustomerPreferenceRepository } from "./customer-preference-repository";

export class LocalCustomerPreferenceRepository implements CustomerPreferenceRepository {
  async listPreferenceTypes(): Promise<PreferenceType[]> {
    return (
      (await asyncStorageStore.get<PreferenceType[]>(
        LOCAL_DATA_KEYS.preferenceTypes(),
      )) ?? []
    );
  }

  async getByUserAndType(
    userId: ID,
    preferenceTypeId: ID,
  ): Promise<CustomerPreference | null> {
    const preferences = await this.listByUser(userId);
    return (
      preferences.find(
        (item) => item.preferenceTypeId === preferenceTypeId && !item.isDeleted,
      ) ?? null
    );
  }

  async listByUser(userId: ID): Promise<CustomerPreference[]> {
    const preferences =
      (await asyncStorageStore.get<CustomerPreference[]>(
        LOCAL_DATA_KEYS.customerPreferences(userId),
      )) ?? [];

    return preferences.filter(
      (item) => item.userId === userId && !item.isDeleted,
    );
  }

  async save(preference: CustomerPreference): Promise<CustomerPreference> {
    const key = LOCAL_DATA_KEYS.customerPreferences(preference.userId);
    const preferences =
      (await asyncStorageStore.get<CustomerPreference[]>(key)) ?? [];

    const index = preferences.findIndex((item) => item.id === preference.id);

    if (index === -1) {
      preferences.push(preference);
    } else {
      preferences[index] = preference;
    }

    await asyncStorageStore.set(key, preferences);
    return preference;
  }
}
