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
  UserAcquisitionService,
  RedemptionService,
  StatusService,
  EntityStatusService,
  CustomerAuthService,
  PaymentService,
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
  userAcquisition: UserAcquisitionService;
  redemption: RedemptionService;
  status: StatusService;
  entityStatus: EntityStatusService;
  auth: CustomerAuthService;
  payment: PaymentService;
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
  status: mockServices.status,
  referenceData: mockReferenceDataService,
  entityStatus: mockServices.entityStatus,
  auth: mockServices.auth,
  payment: mockServices.payment,
};
