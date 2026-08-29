import type { ID, OrganizationBranding } from "@/src/core";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { BrandingRepository } from "./branding-repository";

/**
 * Transitional local implementation.
 *
 * Reads:
 *   local persistence only
 *
 * Writes:
 *   local persistence
 *
 * The fallback to the existing mock/domain service belongs in the
 * service layer, not in this repository.
 */
export class LocalBrandingRepository implements BrandingRepository {
  async getCurrent(organizationId: ID): Promise<OrganizationBranding | null> {
    const key = LOCAL_DATA_KEYS.organizationBranding(organizationId);

    return asyncStorageStore.get<OrganizationBranding>(key);
  }

  async save(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<OrganizationBranding> {
    if (branding.organizationId !== organizationId) {
      throw new Error(
        "Branding organization does not match the target organization.",
      );
    }

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationBranding(organizationId),
      branding,
    );

    return branding;
  }
}
