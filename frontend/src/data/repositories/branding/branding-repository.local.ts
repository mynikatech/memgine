import type { ID, OrganizationBranding } from "@/src/core";
import { services } from "@/src/core";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { BrandingRepository } from "./branding-repository";

/**
 * Transitional local implementation.
 *
 * This adapter exists only until the server API is available.
 *
 * Reads:
 *   local persisted value first
 *   → existing domain service as fallback
 *
 * Writes:
 *   local persistence
 *
 * The UI does not know that this is local.
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
