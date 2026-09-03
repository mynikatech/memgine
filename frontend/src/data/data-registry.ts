import { BrandingApi } from "./api/branding-api";
import { OrganizationApi } from "./api/organization-api";
import { mockServices } from "@/src/core/mocks/mock-services";
import { ProductApi } from "./api/product-api";

import { LocalProductRepository } from "./repositories/product/product-repository.local";

import { LocalBrandingRepository } from "./repositories/branding/branding-repository.local";
import { LocalOrganizationRepository } from "./repositories/organization/organization-repository.local";
import { LocalOrganizationMembersRepository } from "./repositories/organization/organization-members.repository.local";
const organizationRepository = new LocalOrganizationRepository();

const brandingRepository = new LocalBrandingRepository();

const organizationMembersRepository = new LocalOrganizationMembersRepository();
const productRepository = new LocalProductRepository();

export const data = {
  organizationRepository,
  organizationMembersRepository,
  brandingRepository,
  productRepository,
} as const;

export const apis = {
  organization: new OrganizationApi(organizationRepository),

  branding: new BrandingApi(brandingRepository),
  product: new ProductApi(productRepository),
} as const;
