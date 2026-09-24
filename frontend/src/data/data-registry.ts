import { BrandingApi } from "./api/branding-api";
import { BenefitApi } from "./api/benefit-api";
import { MembershipProductApi } from "./api/membership-product-api";
import { OfferApi } from "./api/offer-api";
import { OrganizationApi } from "./api/organization-api";
import { StaffApi } from "./api/staff-api";
import { StoreApi } from "./api/store-api";
import { ProductApi } from "./api/product-api";
import { SubscriptionApi } from "./api/subscription-api";
import { RedemptionApi } from "./api/redemption-api";
import { CustomerPreferenceApi } from "./api/customer-preference-api";
import { ReferralApi } from "./api/referral-api";
import { BenefitUsageRuleApi } from "./api/benefit-usage-rule-api";
import { OfferUsageRuleApi } from "./api/offer-usage-rule-api";
import { QRCodeApi } from "./api/qr-code-api";
import { QRScanHistoryApi } from "./api/qr-scan-history-api";
import { QRMembershipAcquisitionAttributionApi } from "./api/qr-membership-acquisition-attribution-api";
import { BenefitRedemptionQRContextApi } from "./api/benefit-redemption-qr-context-api";
import { OfferRedemptionQRContextApi } from "./api/offer-redemption-qr-context-api";
import { OfferRedemptionApi } from "./api/offer-redemption-api";
import { OrganizationUserApi } from "./api/organization-user-api";
import { NotificationConfigurationApi } from "./api/notification-configuration-api";
import { IntegrationConfigurationApi } from "./api/integration-configuration-api";
import { OrganizationMaintenanceApi } from "./api/organization-maintenance-api";
import { OrganizationAccessApi } from "./api/organization-access-api";

import { LocalBrandingRepository } from "./repositories/branding/branding-repository.local";
import { LocalOrganizationMembersRepository } from "./repositories/organization/organization-members.repository.local";
import { LocalOrganizationRepository } from "./repositories/organization/organization-repository.local";
import { LocalProductRepository } from "./repositories/product/product-repository.local";
import { LocalSubscriptionRepository } from "./repositories/subscription/subscription-repository.local";
import { LocalRedemptionRepository } from "./repositories/redemption/redemption-repository.local";
import { LocalCustomerPreferenceRepository } from "./repositories/customer-preference/customer-preference-repository.local";
import { LocalReferralRepository } from "./repositories/referral/referral-repository.local";
import { LocalQRCodeRepository } from "./repositories/qr-code/qr-code-repository.local";
import { LocalQRScanHistoryRepository } from "./repositories/qr-scan-history/qr-scan-history-repository.local";
import { LocalQRMembershipAcquisitionAttributionRepository } from "./repositories/qr-membership-acquisition-attribution/qr-membership-acquisition-attribution-repository.local";
import { LocalBenefitRedemptionQRContextRepository } from "./repositories/benefit-redemption-qr-context/benefit-redemption-qr-context-repository.local";
import { LocalOfferRedemptionQRContextRepository } from "./repositories/offer-redemption-qr-context/offer-redemption-qr-context-repository.local";
import { LocalOfferRedemptionRepository } from "./repositories/offer-redemption/offer-redemption-repository.local";

// Transitional repositories retained because non-migrated Batch-2 domains
// still depend on local persistence. Organization, branding, store and staff
// reads/writes are now server-authoritative.
const organizationRepository = new LocalOrganizationRepository();
const brandingRepository = new LocalBrandingRepository();
const organizationMembersRepository = new LocalOrganizationMembersRepository();
const productRepository = new LocalProductRepository();
const subscriptionRepository = new LocalSubscriptionRepository();
const redemptionRepository = new LocalRedemptionRepository();
const offerRedemptionRepository = new LocalOfferRedemptionRepository();
const customerPreferenceRepository = new LocalCustomerPreferenceRepository();
const referralRepository = new LocalReferralRepository();
const qrCodeRepository = new LocalQRCodeRepository();
const qrScanHistoryRepository = new LocalQRScanHistoryRepository();
const qrMembershipAcquisitionAttributionRepository =
  new LocalQRMembershipAcquisitionAttributionRepository();
const benefitRedemptionQRContextRepository =
  new LocalBenefitRedemptionQRContextRepository();
const offerRedemptionQRContextRepository =
  new LocalOfferRedemptionQRContextRepository();

export const data = {
  organizationRepository,
  organizationMembersRepository,
  brandingRepository,
  productRepository,
  subscriptionRepository,
  redemptionRepository,
  offerRedemptionRepository,
  customerPreferenceRepository,
  referralRepository,
  qrCodeRepository,
  qrScanHistoryRepository,
  qrMembershipAcquisitionAttributionRepository,
  benefitRedemptionQRContextRepository,
  offerRedemptionQRContextRepository,
} as const;

const benefitApi = new BenefitApi();
const offerApi = new OfferApi();

export const apis = {
  organization: new OrganizationApi(),
  notificationConfiguration: new NotificationConfigurationApi(),
  integrationConfiguration: new IntegrationConfigurationApi(),
  store: new StoreApi(),
  staff: new StaffApi(),
  branding: new BrandingApi(),
  product: new ProductApi(productRepository),
  membershipProduct: new MembershipProductApi(),
  benefit: benefitApi,
  offer: offerApi,
  subscription: new SubscriptionApi(subscriptionRepository),
  redemption: new RedemptionApi(redemptionRepository),
  offerRedemption: new OfferRedemptionApi(offerRedemptionRepository),
  benefitUsageRule: new BenefitUsageRuleApi(benefitApi),
  customerPreference: new CustomerPreferenceApi(customerPreferenceRepository),
  referral: new ReferralApi(referralRepository),
  offerUsageRule: new OfferUsageRuleApi(offerApi),
  qrCode: new QRCodeApi(qrCodeRepository),
  qrScanHistory: new QRScanHistoryApi(qrScanHistoryRepository),
  qrMembershipAcquisitionAttribution: new QRMembershipAcquisitionAttributionApi(
    qrMembershipAcquisitionAttributionRepository,
  ),
  benefitRedemptionQRContext: new BenefitRedemptionQRContextApi(
    benefitRedemptionQRContextRepository,
  ),
  offerRedemptionQRContext: new OfferRedemptionQRContextApi(
    offerRedemptionQRContextRepository,
  ),
  organizationUser: new OrganizationUserApi(),
  organizationMaintenance: new OrganizationMaintenanceApi(),
  organizationAccess: new OrganizationAccessApi(),
} as const;
