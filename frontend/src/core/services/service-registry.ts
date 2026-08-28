import { mockServices } from "../mocks/mock-services";
import { mockReferenceDataService } from "../mocks/mock-reference-data";
import { mockStatusService } from "../mocks/mock-status";
import { mockTemplateService } from "../mocks/mock-template";
import { InMemoryCustomerExperienceService } from "../mocks/mock-customer-experience";
import { mockNotificationService } from "../mocks/mock-notification";

import { LocalOrganizationService } from "./organization-service.local";
import { LocalCustomerExperienceService } from "./customer-experience.local";

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
import type { TemplateService } from "./template";
import type { CustomerExperienceService } from "./customer-experience";
import type { NotificationService } from "./notification";

/**
 * Organization service is migrated progressively.
 *
 * Methods already migrated to repository/API persistence use
 * LocalOrganizationService -> OrganizationApi -> LocalOrganizationRepository.
 *
 * Methods not migrated yet continue to use the existing mock service
 * through the fallback.
 */
const organizationService = new LocalOrganizationService(
  mockServices.organization,
);

const mockCustomerExperienceService = new InMemoryCustomerExperienceService(
  organizationService,
  mockTemplateService,
);
const customerExperienceService = new LocalCustomerExperienceService(
  mockCustomerExperienceService,
);

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
  auth: CustomerAuthService;
  payment: PaymentService;
  referenceData: ReferenceDataService;
  template: TemplateService;
  customerExperience: CustomerExperienceService;
  notification: NotificationService;
};

export const services: MemgineServices = {
  organization: organizationService,
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
  template: mockTemplateService,
  customerExperience: customerExperienceService,
  notification: mockNotificationService,
};
