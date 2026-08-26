import type { ID, OrganizationBranding } from "@/src/core";
import { services } from "@/src/core";

import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";

import type { BrandingRepository } from "./branding-repository";

/**
 * Transitional repository used until the server API exists.
 *
 * It uses the existing domain service as the read-through source for data
 * that has not yet been saved locally, then persists OrgAdmin changes in
 * AsyncStorage. The UI remains unaware of this implementation detail.
 */
export class LocalBrandingRepository implements BrandingRepository {
  async getCurrent(organizationId: ID): Promise<OrganizationBranding | null> {
    const key = LOCAL_DATA_KEYS.organizationBranding(organizationId);
    const local = await asyncStorageStore.get<OrganizationBranding>(key);

    if (local) {
      return local;
    }

    return services.organization.getOrganizationBranding(organizationId);
  }

  async save(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<OrganizationBranding> {
    if (branding.organizationId !== organizationId) {
      throw new Error("Branding organization does not match the target organization.");
    }

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationBranding(organizationId),
      branding,
    );

    return branding;
  }
}
