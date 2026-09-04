import { mockServices } from "../mocks/mock-services";
import { mockReferenceDataService } from "../mocks/mock-reference-data";
import { mockTemplateService } from "../mocks/mock-template";
import { InMemoryCustomerExperienceService } from "../mocks/mock-customer-experience";
import { mockNotificationService } from "../mocks/mock-notification";

import { LocalOrganizationService } from "./organization-service.local";
import { LocalCustomerExperienceService } from "./customer-experience.local";
import { LocalProductService } from "./product-service.local";
import { LocalMembershipProductService } from "./membership-product-service.local";
import { LocalBenefitService } from "./benefit-service.local";
import { CachedStatusService } from "./status-cache";
import { LocalStatusService } from "./status-service.local";

import type {
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
  ProductService,
  PaymentService,
} from "./service-contracts";

import type { ReferenceDataService } from "./reference-data";
import type { StatusService } from "./status";
import type { TemplateService } from "./template";
import type { CustomerExperienceService } from "./customer-experience";
import type { NotificationService } from "./notification";

const organizationService: OrganizationService = new LocalOrganizationService(
  mockServices.organization,
);

const productService: ProductService = new LocalProductService();

const membershipProductService: MembershipProductService =
  new LocalMembershipProductService(mockServices.membershipProduct);

const benefitService: BenefitService = new LocalBenefitService(
  mockServices.benefit,
);

const localStatusService = new LocalStatusService();

const statusService: StatusService = new CachedStatusService(
  localStatusService,
);

const mockCustomerExperienceService = new InMemoryCustomerExperienceService(
  organizationService,
  mockTemplateService,
);

const customerExperienceService: CustomerExperienceService =
  new LocalCustomerExperienceService(mockCustomerExperienceService);

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
  product: ProductService;
};

export const services: MemgineServices = {
  organization: organizationService,
  customer: mockServices.customer,

  membershipProduct: membershipProductService,

  subscription: mockServices.subscription,
  subscriptionPlan: mockServices.subscriptionPlan,

  benefit: benefitService,

  offer: mockServices.offer,
  userAcquisition: mockServices.userAcquisition,
  redemption: mockServices.redemption,

  status: statusService,

  auth: mockServices.auth,
  payment: mockServices.payment,

  referenceData: mockReferenceDataService,
  template: mockTemplateService,

  customerExperience: customerExperienceService,
  notification: mockNotificationService,

  product: productService,
};
