import { BrandingApi } from "./api/branding-api";
import { BenefitApi } from "./api/benefit-api";
import { MembershipProductApi } from "./api/membership-product-api";
import { OrganizationApi } from "./api/organization-api";
import { ProductApi } from "./api/product-api";

import { LocalBrandingRepository } from "./repositories/branding/branding-repository.local";

import { LocalBenefitRepository } from "./repositories/benefit/benefit-repository.local";

import { LocalMembershipProductRepository } from "./repositories/membership/membership-product-repository.local";

import { LocalOrganizationMembersRepository } from "./repositories/organization/organization-members.repository.local";

import { LocalOrganizationRepository } from "./repositories/organization/organization-repository.local";

import { LocalProductRepository } from "./repositories/product/product-repository.local";

const organizationRepository = new LocalOrganizationRepository();

const brandingRepository = new LocalBrandingRepository();

const organizationMembersRepository = new LocalOrganizationMembersRepository();

const productRepository = new LocalProductRepository();

const membershipProductRepository = new LocalMembershipProductRepository();

const benefitRepository = new LocalBenefitRepository();

export const data = {
  organizationRepository,
  organizationMembersRepository,
  brandingRepository,
  productRepository,
  membershipProductRepository,
  benefitRepository,
} as const;

export const apis = {
  organization: new OrganizationApi(organizationRepository),

  branding: new BrandingApi(brandingRepository),

  product: new ProductApi(productRepository),

  membershipProduct: new MembershipProductApi(membershipProductRepository),

  benefit: new BenefitApi(benefitRepository),
} as const;
