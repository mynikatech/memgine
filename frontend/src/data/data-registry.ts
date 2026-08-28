import { BrandingApi } from "./api/branding-api";
import { OrganizationApi } from "./api/organization-api";
import { mockServices } from "@/src/core/mocks/mock-services";

import { LocalBrandingRepository } from "./repositories/branding/branding-repository.local";
import { LocalOrganizationRepository } from "./repositories/organization/organization-repository.local";

const organizationRepository = new LocalOrganizationRepository();

const brandingRepository = new LocalBrandingRepository();

export const data = {
  organizationRepository,
  brandingRepository,
} as const;

export const apis = {
  organization: new OrganizationApi(organizationRepository),

  branding: new BrandingApi(brandingRepository),
} as const;
