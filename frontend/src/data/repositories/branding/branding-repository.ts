import type { ID, OrganizationBranding } from "@/src/core";

export interface BrandingRepository {
  getCurrent(organizationId: ID): Promise<OrganizationBranding | null>;

  save(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<OrganizationBranding>;
}
