import { mockServices } from "../mocks/mock-services";
import { mockReferenceDataService } from "../mocks/mock-reference-data";
import { mockStatusService } from "../mocks/mock-status";

import {
  OrganizationService,
  CustomerService,
  MembershipProductService,
  SubscriptionService,
  SubscriptionPlanService,
  BenefitService,
  OfferService,
  UserAcquisitionService,
  RedemptionService,
  CustomerAuthService,
  PaymentService,
} from "./service-contracts";

import type { ReferenceDataService } from "./reference-data";
import type { StatusService } from "./status";

/**
 * Application service registry.
 *
 * UI components consume provider-neutral services.
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
  userAcquisition: UserAcquisitionService;
  redemption: RedemptionService;

  /**
   * Canonical status domain.
   *
   * Status, EntityType and EntityStatus are intentionally kept separate
   * from ordinary reference data.
   */
  status: StatusService;

  auth: CustomerAuthService;
  payment: PaymentService;

  /**
   * Ordinary reference data only.
   */
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
  userAcquisition: mockServices.userAcquisition,
  redemption: mockServices.redemption,

  status: mockStatusService,

  auth: mockServices.auth,
  payment: mockServices.payment,

  referenceData: mockReferenceDataService,
};
