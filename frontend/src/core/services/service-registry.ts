import { mockServices } from "../mocks/mock-services";
import { mockReferenceDataService } from "../mocks/mock-reference-data";
import { mockTemplateService } from "../mocks/mock-template";
import { InMemoryCustomerExperienceService } from "../mocks/mock-customer-experience";
import { mockNotificationService } from "../mocks/mock-notification";

import { LocalOrganizationService } from "./organization-service.local";
import { LocalCustomerExperienceService } from "./customer-experience.local";
import { LocalUserAcquisitionService } from "./user-acquisition-service.local";
import { LocalProductService } from "./product-service.local";
import { LocalMembershipProductService } from "./membership-product-service.local";
import { LocalBenefitService } from "./benefit-service.local";
import { LocalOfferService } from "./offer-service.local";
import { LocalSubscriptionService } from "./subscription-service.local";
import { LocalPaymentService } from "./payment-service.local";
import { CachedStatusService } from "./status-cache";
import { LocalStatusService } from "./status-service.local";
import { LocalRedemptionService } from "./redemption-service.local";
import { LocalCustomerPreferenceService } from "./customer-preference-service.local";
import { LocalReferralService } from "./referral-service.local";
import { ReferralEngine } from "./referral-engine";
import { LocalBenefitUsageRuleService } from "./benefit-usage-rule-service";
import type { BenefitUsageRuleService } from "./service-contracts.benefit-usage-rule.additions";
import { LocalOfferUsageRuleService } from "./offer-usage-rule-service";
import type { OfferUsageRuleService } from "./offer-usage-rule-service";

import { LocalQRCodeService } from "./qr-code-service";
import type { QRCodeService } from "./qr-code-service";
import { LocalQRScanHistoryService } from "./qr-scan-history-service";
import type { QRScanHistoryService } from "./qr-scan-history-service";
import { LocalQRMembershipAcquisitionAttributionService } from "./qr-membership-acquisition-attribution-service";

import { LocalBenefitRedemptionQRService } from "./benefit-redemption-qr-service";

import type { BenefitRedemptionQRService } from "./benefit-redemption-qr-service";

import { LocalOfferRedemptionQRService } from "./offer-redemption-qr-service";

import type { OfferRedemptionQRService } from "./offer-redemption-qr-service";

import { apis } from "@/src/data/data-registry";

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
  new LocalMembershipProductService(
    mockServices.membershipProduct,
    organizationService,
  );

const benefitService: BenefitService = new LocalBenefitService(
  mockServices.benefit,
);

const offerService: OfferService = new LocalOfferService(mockServices.offer);

const userAcquisitionService: UserAcquisitionService =
  new LocalUserAcquisitionService(mockServices.userAcquisition);

const localStatusService = new LocalStatusService();

const statusService: StatusService = new CachedStatusService(
  localStatusService,
);
const qrCodeService: QRCodeService = new LocalQRCodeService(apis.qrCode);
const qrScanHistoryService: QRScanHistoryService =
  new LocalQRScanHistoryService(apis.qrScanHistory);

const qrMembershipAcquisitionAttributionService =
  new LocalQRMembershipAcquisitionAttributionService(
    organizationService,
    membershipProductService,
    qrCodeService,
    qrScanHistoryService,
    apis.qrMembershipAcquisitionAttribution,
  );

const subscriptionService: SubscriptionService = new LocalSubscriptionService(
  mockServices.subscription,
  organizationService,
  qrMembershipAcquisitionAttributionService,
);

const benefitRedemptionQRService: BenefitRedemptionQRService =
  new LocalBenefitRedemptionQRService(
    organizationService,
    subscriptionService,
    benefitService,
    statusService,
    qrCodeService,
    apis.benefitRedemptionQRContext,
  );

const offerRedemptionQRService: OfferRedemptionQRService =
  new LocalOfferRedemptionQRService(
    organizationService,
    offerService,
    statusService,
    qrCodeService,
    apis.offerRedemptionQRContext,
  );

const mockCustomerExperienceService = new InMemoryCustomerExperienceService(
  organizationService,
  mockTemplateService,
);

const customerExperienceService: CustomerExperienceService =
  new LocalCustomerExperienceService(mockCustomerExperienceService);

const paymentService: PaymentService = new LocalPaymentService(
  mockServices.payment,
);

const redemptionService: RedemptionService = new LocalRedemptionService();

const customerPreferenceService = new LocalCustomerPreferenceService(
  apis.customerPreference,
);
const benefitUsageRuleService: BenefitUsageRuleService =
  new LocalBenefitUsageRuleService(apis.benefitUsageRule);
const offerUsageRuleService: OfferUsageRuleService =
  new LocalOfferUsageRuleService(apis.offerUsageRule);

const referralService = new LocalReferralService(apis.referral);
const referralEngine = new ReferralEngine(referralService);

export type MemgineServices = {
  organization: OrganizationService;
  customer: CustomerService;
  membershipProduct: MembershipProductService;
  qrMembershipAcquisitionAttribution: import("./qr-membership-acquisition-attribution-service").QRMembershipAcquisitionAttributionService;
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
  customerPreference: import("./service-contracts.profile-referral.additions").CustomerPreferenceService;
  referral: import("./service-contracts.profile-referral.additions").ReferralService;
  referralEngine: ReferralEngine;
  benefitUsageRule: BenefitUsageRuleService;
  offerUsageRule: OfferUsageRuleService;
  qrCode: QRCodeService;
  qrScanHistory: QRScanHistoryService;
  benefitRedemptionQR: BenefitRedemptionQRService;
  offerRedemptionQR: OfferRedemptionQRService;
};

export const services: MemgineServices = {
  organization: organizationService,
  customer: mockServices.customer,
  membershipProduct: membershipProductService,
  subscription: subscriptionService,
  subscriptionPlan: mockServices.subscriptionPlan,
  benefit: benefitService,
  benefitRedemptionQR: benefitRedemptionQRService,
  offerRedemptionQR: offerRedemptionQRService,
  offer: offerService,
  userAcquisition: userAcquisitionService,
  redemption: redemptionService,
  status: statusService,
  auth: mockServices.auth,
  payment: paymentService,
  referenceData: mockReferenceDataService,
  template: mockTemplateService,
  customerExperience: customerExperienceService,
  notification: mockNotificationService,
  product: productService,
  customerPreference: customerPreferenceService,
  referral: referralService,
  referralEngine,
  benefitUsageRule: benefitUsageRuleService,
  offerUsageRule: offerUsageRuleService,
  qrCode: qrCodeService,
  qrScanHistory: qrScanHistoryService,
  qrMembershipAcquisitionAttribution: qrMembershipAcquisitionAttributionService,
};
