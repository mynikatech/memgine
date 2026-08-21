import { mockServices } from "../mocks/mock-services";
import { mockReferenceDataService } from "../mocks/mock-reference-data";

import {
  OrganizationService,
  CustomerService,
  MembershipProductService,
  SubscriptionService,
  SubscriptionPlanService,
  BenefitService,
  OfferService,
} from "./service-contracts";

import { ReferenceDataService } from "./reference-data";

/**
 * Application service registry.
 *
 * UI components consume these provider-neutral services.
 *
 * Current implementation:
 *   Mock API/data implementation
 *
 * Production implementation:
 *   API-backed implementation
 *
 * The UI should not change when the implementation changes.
 */
export type MemgineServices = {
  organization: OrganizationService;
  customer: CustomerService;
  membershipProduct: MembershipProductService;
  subscription: SubscriptionService;
  subscriptionPlan: SubscriptionPlanService;
  benefit: BenefitService;
  offer: OfferService;
  referenceData: ReferenceDataService;
};

export const services: MemgineServices = {
  organization: mockServices.organization,
  customer: mockServices.customer,
  membershipProduct: mockServices.membershipProduct,
  subscription: mockServices.subscription,
  subscriptionPlan: mockServices.subscriptionPlan,
  benefit: mockServices.benefit,
  offer: mockServices.offer,
  referenceData: mockReferenceDataService,
};
