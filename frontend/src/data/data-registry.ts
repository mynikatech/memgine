import { BrandingApi } from "./api/branding-api";
import { BenefitApi } from "./api/benefit-api";
import { MembershipProductApi } from "./api/membership-product-api";
import { OfferApi } from "./api/offer-api";
import { OrganizationApi } from "./api/organization-api";
import { ProductApi } from "./api/product-api";
import { SubscriptionApi } from "./api/subscription-api";

import { LocalBrandingRepository } from "./repositories/branding/branding-repository.local";
import { LocalBenefitRepository } from "./repositories/benefit/benefit-repository.local";
import { LocalMembershipProductRepository } from "./repositories/membership/membership-product-repository.local";
import { LocalOfferRepository } from "./repositories/offer/offer-repository.local";
import { LocalOrganizationMembersRepository } from "./repositories/organization/organization-members.repository.local";
import { LocalOrganizationRepository } from "./repositories/organization/organization-repository.local";
import { LocalProductRepository } from "./repositories/product/product-repository.local";
import { LocalSubscriptionRepository } from "./repositories/subscription/subscription-repository.local";

const organizationRepository = new LocalOrganizationRepository();
const brandingRepository = new LocalBrandingRepository();
const organizationMembersRepository = new LocalOrganizationMembersRepository();
const productRepository = new LocalProductRepository();
const membershipProductRepository = new LocalMembershipProductRepository();
const benefitRepository = new LocalBenefitRepository();
const offerRepository = new LocalOfferRepository();
const subscriptionRepository = new LocalSubscriptionRepository();

export const data = {
  organizationRepository,
  organizationMembersRepository,
  brandingRepository,
  productRepository,
  membershipProductRepository,
  benefitRepository,
  offerRepository,
  subscriptionRepository,
} as const;

export const apis = {
  organization: new OrganizationApi(organizationRepository),
  branding: new BrandingApi(brandingRepository),
  product: new ProductApi(productRepository),
  membershipProduct: new MembershipProductApi(membershipProductRepository),
  benefit: new BenefitApi(benefitRepository),
  offer: new OfferApi(offerRepository),
  subscription: new SubscriptionApi(subscriptionRepository),
} as const;
