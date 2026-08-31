import { BusinessContext } from "../context/business-context";
import { ID } from "../domain/common";

import { getDefaultBusinessTemplate } from "../defaults/default-business-template";
import { BAKERY_V1 } from "../template/bakery-template-definition";

import { registerBusinessContext } from "../defaults/business-registry";
import { mockStatusService } from "./mock-status";

import {
  registerBusinessContent,
  cloneBusinessContent,
} from "../defaults/business-content";

import { CardStyle } from "../template/template-definition";

import { TemplateCategory } from "../domain/common";
import {
  Benefit,
  Customer,
  EntityType,
  EntityStatus,
  MembershipProduct,
  Offer,
  Organization,
  OrganizationDetails,
  OrganizationBranding,
  NotificationConfiguration,
  IntegrationConfiguration,
  OrganizationAccount,
  Redemption,
  RedemptionMethod,
  Store,
  Subscription,
  Status,
  SubscriptionPlan,
  Staff,
  OrganizationUser,
  UserAcquisition,
} from "../domain/entities";
import {
  BenefitService,
  CreateCustomerInput,
  CreateSubscriptionInput,
  CustomerAuthService,
  CustomerLookupQuery,
  CustomerService,
  MembershipProductService,
  OfferService,
  OrganizationService,
  UserAcquisitionService,
  PaymentRequest,
  PaymentResult,
  PaymentService,
  PerformRedemptionInput,
  RedemptionService,
  SendOtpInput,
  SendOtpResult,
  StatusService,
  SubscriptionService,
  SubscriptionPlanService,
  VerifyOtpInput,
  VerifyOtpResult,
  OnboardOrganizationInput,
  OnboardOrganizationResult,
} from "../services/service-contracts";
import {
  SUNRISE_BAKERY_ACCOUNT,
  SUNRISE_BAKERY_CONTEXT,
  SUNRISE_BAKERY_ORGANIZATION,
} from "../defaults/sunrise-bakery";
import {
  GLOW_STUDIO_ACCOUNT,
  GLOW_STUDIO_CONTEXT,
  GLOW_STUDIO_ORGANIZATION,
} from "../defaults/glow-studio";
import {
  STEEP_SIP_ACCOUNT,
  STEEP_SIP_CONTEXT,
  STEEP_SIP_ORGANIZATION,
} from "../defaults/steep-sip";

import {
  STEEP_SIP_BENEFITS,
  STEEP_SIP_CUSTOMER_ORGANIZATION_USER,
  STEEP_SIP_CUSTOMERS,
  STEEP_SIP_OFFERS,
  STEEP_SIP_ORGANIZATION_USERS,
  STEEP_SIP_PRODUCTS,
  STEEP_SIP_STAFF,
  STEEP_SIP_STORES,
  STEEP_SIP_USER_ACQUISITIONS,
} from "./steep-sip-demo-data";

import {
  DEFAULT_ROLE_CAPABILITIES,
  StaffRole,
} from "../permissions/permissions";

import { BusinessConfiguration, ManagementModel, PlanTier } from "@/src/core";

const ORGANIZATIONS: Organization[] = [
  SUNRISE_BAKERY_ORGANIZATION,
  GLOW_STUDIO_ORGANIZATION,
  STEEP_SIP_ORGANIZATION,
];
const ACCOUNTS: OrganizationAccount[] = [
  SUNRISE_BAKERY_ACCOUNT,
  GLOW_STUDIO_ACCOUNT,
  STEEP_SIP_ACCOUNT,
];
const BUSINESS_CONTEXTS_BY_ORG: Record<string, BusinessContext> = {
  [SUNRISE_BAKERY_ORGANIZATION.id]: SUNRISE_BAKERY_CONTEXT,
  [GLOW_STUDIO_ORGANIZATION.id]: GLOW_STUDIO_CONTEXT,
  [STEEP_SIP_ORGANIZATION.id]: STEEP_SIP_CONTEXT,
};
const ORGANIZATION_DETAILS: OrganizationDetails[] = [
  {
    id: "details-org-sunrise-bakery",
    organizationId: "org-sunrise",
    registrationNumber: "",
    gstNumber: "",
    supportEmail: "support@sunrisebakery.ca",
    supportPhone: {
      countryId: "country-ca",
      callingCode: "+1",
      number: "",
    },
    aboutOrganization: "Freshly baked breads, pastries, and treats made daily.",
    address: {
      line1: "",
      line2: "",
      city: "Toronto",
      region: "Ontario",
      postalCode: "",
      countryCode: "CA",
    },
    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",
    isDeleted: false,
    versionNo: 1,
  },
];

// Sunrise Bakery mock
const ORGANIZATION_BRANDING: OrganizationBranding[] = [
  {
    id: "branding-org-sunrise",
    organizationId: "org-sunrise",

    brandingName: "Sunrise Bakery",
    themeTemplateId: BAKERY_V1.id,

    logoUrl: undefined,
    darkThemeLogoUrl: undefined,
    faviconUrl: undefined,
    splashScreenImageUrl: undefined,

    primaryColor: "#C2410C",
    secondaryColor: "#D97706",
    accentColor: "#FFFFFF",

    brandingStatusId: "branding-status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

// Sunrise Bakery mock
const NOTIFICATION_CONFIGURATIONS: NotificationConfiguration[] = [
  {
    id: "notification-config-org-sunrise-bakery",
    organizationId: "org-sunrise",
    configurationName: "Sunrise Bakery Notifications",

    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,

    notificationStatusId: "status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/**Entity Types Mock Data */
const entityTypes: EntityType[] = [
  {
    id: "entity-type-organization",
    entityTypeCode: "ORGANIZATION",
    entityTypeName: "Organization",
    description: "Organization entity.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "entity-type-organization-user",
    entityTypeCode: "ORGANIZATION_USER",
    entityTypeName: "Organization User",
    description: "Organization user entity.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "entity-type-membership-product",
    entityTypeCode: "MEMBERSHIP_PRODUCT",
    entityTypeName: "Membership Product",
    description: "Membership product entity.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "entity-type-benefit",
    entityTypeCode: "BENEFIT",
    entityTypeName: "Benefit",
    description: "Benefit entity.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "entity-type-subscription-plan",
    entityTypeCode: "SUBSCRIPTION_PLAN",
    entityTypeName: "Subscription Plan",
    description: "Subscription plan entity.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "entity-type-subscription",
    entityTypeCode: "SUBSCRIPTION",
    entityTypeName: "Subscription",
    description: "Customer subscription entity.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "entity-type-redemption",
    entityTypeCode: "REDEMPTION",
    entityTypeName: "Redemption",
    description: "Redemption transaction entity.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "entity-type-store",
    entityTypeCode: "STORE",
    entityTypeName: "Store",
    description: "Store entity.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "entity-type-staff",
    entityTypeCode: "STAFF",
    entityTypeName: "Staff",
    description: "Staff entity.",
    displayOrder: 9,
    isActive: true,
  },
];

/** Status Reference data */
const statuses: Status[] = [
  {
    id: "status-active",
    statusCode: "ACTIVE",
    statusName: "Active",
    description: "Entity is active and operational.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "status-inactive",
    statusCode: "INACTIVE",
    statusName: "Inactive",
    description: "Entity is inactive.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "status-pending",
    statusCode: "PENDING",
    statusName: "Pending",
    description: "Awaiting approval or activation.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "status-suspended",
    statusCode: "SUSPENDED",
    statusName: "Suspended",
    description: "Temporarily suspended.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "status-cancelled",
    statusCode: "CANCELLED",
    statusName: "Cancelled",
    description: "Cancelled by user or organization.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "status-expired",
    statusCode: "EXPIRED",
    statusName: "Expired",
    description: "Validity period ended.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "status-closed",
    statusCode: "CLOSED",
    statusName: "Closed",
    description: "Permanently closed.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "status-relieved",
    statusCode: "RELIEVED",
    statusName: "Relieved",
    description: "Employment ended.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "status-locked",
    statusCode: "LOCKED",
    statusName: "Locked",
    description: "Access temporarily locked.",
    displayOrder: 9,
    isActive: true,
  },
  {
    id: "status-retired",
    statusCode: "RETIRED",
    statusName: "Retired",
    description: "No longer available.",
    displayOrder: 10,
    isActive: true,
  },
  {
    id: "status-draft",
    statusCode: "DRAFT",
    statusName: "Draft",
    description: "Not yet published.",
    displayOrder: 11,
    isActive: true,
  },
  {
    id: "status-success",
    statusCode: "SUCCESS",
    statusName: "Successful",
    description: "Transaction completed successfully.",
    displayOrder: 12,
    isActive: true,
  },
  {
    id: "status-failed",
    statusCode: "FAILED",
    statusName: "Failed",
    description: "Transaction failed.",
    displayOrder: 13,
    isActive: true,
  },
  {
    id: "status-reversed",
    statusCode: "REVERSED",
    statusName: "Reversed",
    description: "Transaction reversed.",
    displayOrder: 14,
    isActive: true,
  },
];

const entityStatuses: EntityStatus[] = [
  // Subscription
  {
    id: "entity-status-subscription-active",
    entityTypeId: "entity-type-subscription",
    statusId: "status-active",
    displayOrder: 1,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-subscription-cancelled",
    entityTypeId: "entity-type-subscription",
    statusId: "status-cancelled",
    displayOrder: 2,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-subscription-expired",
    entityTypeId: "entity-type-subscription",
    statusId: "status-expired",
    displayOrder: 3,
    isActive: true,
    systemManaged: true,
  },

  // Redemption
  {
    id: "entity-status-redemption-success",
    entityTypeId: "entity-type-redemption",
    statusId: "status-success",
    displayOrder: 1,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-redemption-failed",
    entityTypeId: "entity-type-redemption",
    statusId: "status-failed",
    displayOrder: 2,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-redemption-reversed",
    entityTypeId: "entity-type-redemption",
    statusId: "status-reversed",
    displayOrder: 3,
    isActive: true,
    systemManaged: true,
  },

  // Benefit
  {
    id: "entity-status-benefit-active",
    entityTypeId: "entity-type-benefit",
    statusId: "status-active",
    displayOrder: 1,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-benefit-inactive",
    entityTypeId: "entity-type-benefit",
    statusId: "status-inactive",
    displayOrder: 2,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-benefit-draft",
    entityTypeId: "entity-type-benefit",
    statusId: "status-draft",
    displayOrder: 3,
    isActive: true,
    systemManaged: true,
  },

  // Staff
  {
    id: "entity-status-staff-active",
    entityTypeId: "entity-type-staff",
    statusId: "status-active",
    displayOrder: 1,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-staff-inactive",
    entityTypeId: "entity-type-staff",
    statusId: "status-inactive",
    displayOrder: 2,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-staff-relieved",
    entityTypeId: "entity-type-staff",
    statusId: "status-relieved",
    displayOrder: 3,
    isActive: true,
    systemManaged: true,
  },
  {
    id: "entity-status-staff-retired",
    entityTypeId: "entity-type-staff",
    statusId: "status-retired",
    displayOrder: 4,
    isActive: true,
    systemManaged: true,
  },
];

// Sunrise Bakery mock
const INTEGRATION_CONFIGURATIONS: IntegrationConfiguration[] = [
  {
    id: "integration-config-sunrise-payment",
    organizationId: "org-sunrise",
    integrationName: "Sunrise Payments",
    integrationTypeId: "integration-type-payment",
    provider: "Razorpay",
    integrationStatusId: "status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "integration-config-sunrise-pos",
    organizationId: "org-sunrise",
    integrationName: "Sunrise POS",
    integrationTypeId: "integration-type-pos",
    provider: "Lightspeed",
    integrationStatusId: "status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "integration-config-sunrise-email",
    organizationId: "org-sunrise",
    integrationName: "Sunrise Email",
    integrationTypeId: "integration-type-email",
    provider: "Resend",
    integrationStatusId: "status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "integration-config-sunrise-whatsapp",
    organizationId: "org-sunrise",
    integrationName: "Sunrise WhatsApp",
    integrationTypeId: "integration-type-whatsapp",
    provider: "Meta",
    integrationStatusId: "status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

const organizationUsers: OrganizationUser[] = [
  {
    id: "org-user-sunrise-owner",
    organizationId: "org-sunrise",
    userId: "user-sunrise-owner",
    organizationUserTypeId: "org-user-type-owner",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-01-01",

    createdAt: "2026-01-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "org-user-sunrise-manager",
    organizationId: "org-sunrise",
    userId: "user-sunrise-manager",
    organizationUserTypeId: "org-user-type-employee",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-01-02",

    createdAt: "2026-01-02T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-02T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "org-user-sunrise-staff",
    organizationId: "org-sunrise",
    userId: "user-sunrise-staff",
    organizationUserTypeId: "org-user-type-employee",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-01-03",

    createdAt: "2026-01-03T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-03T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  // Customer relationships
  {
    id: "org-user-sunrise-customer-ada",
    organizationId: "org-sunrise",
    userId: "cust-1",
    organizationUserTypeId: "org-user-type-customer",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-02-01",

    createdAt: "2026-02-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-02-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "org-user-sunrise-customer-demo",
    organizationId: "org-sunrise",
    userId: "cust-new-demo",
    organizationUserTypeId: "org-user-type-customer",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-06-01",

    createdAt: "2026-06-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-06-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "org-user-glow-customer-ada",
    organizationId: "org-glow",
    userId: "cust-1",
    organizationUserTypeId: "org-user-type-customer",
    organizationUserStatusId: "status-active",
    joiningDate: "2026-04-01",

    createdAt: "2026-04-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-04-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_ORGANIZATION_USERS,
  STEEP_SIP_CUSTOMER_ORGANIZATION_USER,
];

const userAcquisitions: UserAcquisition[] = [
  {
    id: "user-acq-sunrise-customer-ada",
    userId: "cust-1",

    registrationSource: "STORE_SCANNER",
    registrationChannel: "QR_CODE",
    sourceStoreId: "store-1",

    createdAt: "2026-02-01T08:30:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-02-01T08:30:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "user-acq-sunrise-customer-demo",
    userId: "cust-new-demo",

    registrationSource: "DIRECT_REGISTRATION",
    registrationChannel: "WEB",

    createdAt: "2026-06-01T08:30:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-06-01T08:30:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "user-acq-sunrise-prospect-1",
    userId: "cust-prospect-1",

    registrationSource: "STORE_SCANNER",
    registrationChannel: "QR_CODE",
    sourceStoreId: "store-1",

    createdAt: "2026-08-10T14:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-10T14:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_USER_ACQUISITIONS,
];

const staff: Staff[] = [
  {
    id: "staff-dev-owner",
    organizationId: "org-sunrise",
    organizationUserId: "org-user-sunrise-owner",

    staffCode: "ST-001",
    fullName: "Sunrise Bakery Owner",
    designation: "Owner",

    storeId: "store-1",

    joiningDate: "2026-01-01",
    relievingDate: undefined,
    staffStatusId: "staff-status-active",

    role: StaffRole.OWNER,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.OWNER],
    isActive: true,

    createdAt: "2026-01-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "staff-sunrise-manager",
    organizationId: "org-sunrise",
    organizationUserId: "org-user-sunrise-manager",

    staffCode: "ST-002",
    fullName: "Sarah Manager",
    designation: "Store Manager",

    storeId: "store-1",

    joiningDate: "2026-01-01",
    relievingDate: undefined,
    staffStatusId: "staff-status-active",

    role: StaffRole.MANAGER,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.MANAGER],
    isActive: true,

    createdAt: "2026-01-02T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-02T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "staff-sunrise-counter",
    organizationId: "org-sunrise",
    organizationUserId: "org-user-sunrise-staff",

    staffCode: "ST-003",
    fullName: "Alex Counter Staff",
    designation: "Counter Staff",

    storeId: "store-1",

    joiningDate: "2026-01-03",
    relievingDate: undefined,
    staffStatusId: "staff-status-active",

    role: StaffRole.STAFF,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.STAFF],
    isActive: true,

    createdAt: "2026-01-03T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-01-03T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_STAFF,
];

/**
 * In-memory service implementations. Their ONLY purpose is to demonstrate that
 * the frozen service contracts compile and can be consumed. They are not wired
 * into any UI and connect to no database or backend.
 */

let idCounter = 0;
const genId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${idCounter++}`;

const stores: Store[] = [
  {
    id: "store-1",
    organizationId: "org-sunrise",
    storeCode: "MAIN-001",
    name: "Sunrise Bakery — Main St",
    storeTypeId: "store-type-retail",

    phoneNumber: {
      countryId: "country-ca",
      callingCode: "+1",
      number: "4165550100",
    },
    emailAddress: "main@sunrisebakery.ca",

    address: {
      line1: "1 Main St",
      line2: "",
      city: "Toronto",
      region: "Ontario",
      postalCode: "M5V 1A1",
      countryCode: "CA",
    },

    timezone: "America/Toronto",

    storeStatusId: "store-status-active",

    openingDate: "2026-09-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "glow-store-1",
    organizationId: "org-glow",
    storeCode: "GLOW-001",
    name: "Glow Studio — Uptown",
    storeTypeId: "store-type-beauty",
    phoneNumber: {
      countryId: "country-ca",
      callingCode: "+1",
      number: "4165550120",
    },
    emailAddress: "main@glowstores.us",
    address: {
      line1: "88 Bloom Avenue",
      city: "Los Angeles",
      region: "CA",
      postalCode: "90028",
      countryCode: "US",
    },
    timezone: "America/Los_Angeles",
    storeStatusId: "store-status-active",

    openingDate: "2026-09-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_STORES,
];

const benefits: Benefit[] = [
  // ---------------------------------------------------------------------------
  // Sunrise Bakery
  // ---------------------------------------------------------------------------
  {
    id: "ben-1",
    organizationId: "org-sunrise",

    benefitCode: "PASTRY-10",
    benefitName: "10% Pastry Discount",
    displayName: "10% off pastries",

    benefitCategoryId: "benefit-category-discount",
    benefitTypeId: "benefit-type-discount",

    description: "10% off on all pastries.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "ben-2",
    organizationId: "org-sunrise",

    benefitCode: "BIRTHDAY-CUPCAKE",
    benefitName: "Birthday Cupcake",
    displayName: "Free birthday cupcake",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-freebie",

    description:
      "One complimentary cupcake during the customer's birthday month.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "ben-3",
    organizationId: "org-sunrise",

    benefitCode: "DAILY-COFFEE",
    benefitName: "Daily Filter Coffee",
    displayName: "Free filter coffee",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-freebie",

    description: "One complimentary filter coffee per day.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  // ---------------------------------------------------------------------------
  // Glow Studio
  // ---------------------------------------------------------------------------
  {
    id: "glow-ben-1",
    organizationId: "org-glow",

    benefitCode: "MONTHLY-FACIAL",
    benefitName: "Monthly Signature Facial",
    displayName: "Monthly signature facial",

    benefitCategoryId: "benefit-category-service",
    benefitTypeId: "benefit-type-freebie",

    description: "One complimentary signature facial each month.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-ben-2",
    organizationId: "org-glow",

    benefitCode: "PRODUCTS-15",
    benefitName: "15% Product Discount",
    displayName: "15% off all products",

    benefitCategoryId: "benefit-category-discount",
    benefitTypeId: "benefit-type-discount",

    description: "15% member discount on take-home skincare products.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-ben-3",
    organizationId: "org-glow",

    benefitCode: "PRIORITY-BOOKING",
    benefitName: "Priority Booking",
    displayName: "Priority booking",

    benefitCategoryId: "benefit-category-service",
    benefitTypeId: "benefit-type-perk",

    description: "Member-only priority access to appointments.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-01-01",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_BENEFITS,
];
const now = new Date().toISOString();
const products: MembershipProduct[] = [
  {
    id: "prod-1",
    organizationId: "org-sunrise",

    membershipProductCode: "SUNRISE-BAKERY",
    membershipProductName: "Sunrise Bakery Membership",
    displayName: "Gold",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "Annual Sunrise Bakery membership.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-01-01",

    benefitIds: ["ben-1", "ben-2"],

    plans: [
      {
        id: "plan-1",
        membershipProductId: "prod-1",

        subscriptionPlanCode: "SUNRISE-BAKERY-ANNUAL",
        subscriptionPlanName: "Annual",

        description: "Annual Sunrise Bakery membership.",

        subscriptionPeriod: 12,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 29900,
          currency: "INR",
        },
        currencyId: "currency-inr",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-01-01",

        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,
        versionNo: 1,
      },
    ],

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "prod-2",
    organizationId: "org-sunrise",

    membershipProductCode: "SUNRISE-COFFEE",
    membershipProductName: "Coffee Club",
    displayName: "Silver",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "For daily coffee lovers",

    productStatusId: "product-status-active",

    effectiveDate: "2026-09-01",

    benefitIds: ["ben-3"],

    plans: [
      {
        id: "plan-2",
        membershipProductId: "prod-2",

        subscriptionPlanCode: "SUNRISE-COFFEE-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly Coffee Club membership",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 19900,
          currency: "INR",
        },
        currencyId: "currency-inr",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-09-01",

        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,
        versionNo: 1,
      },
    ],

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-prod-1",
    organizationId: "org-glow",

    membershipProductCode: "GLOW-RADIANCE",
    membershipProductName: "Radiance Membership",
    displayName: "Radiance",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "Monthly facials, priority booking and member pricing.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-09-01",

    benefitIds: ["glow-ben-1", "glow-ben-2", "glow-ben-3"],

    plans: [
      {
        id: "glow-plan-1",
        membershipProductId: "glow-prod-1",

        subscriptionPlanCode: "GLOW-RADIANCE-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly Radiance Membership subscription",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 5900,
          currency: "USD",
        },
        currencyId: "currency-usd",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-09-01",

        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,
        versionNo: 1,
      },
    ],

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "prod-3",
    organizationId: "org-sunrise",

    membershipProductCode: "SUNRISE-PLATINUM",
    membershipProductName: "Sunrise Platinum",
    displayName: "Platinum",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "Our top tier — every perk, all year round.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-09-01",

    benefitIds: ["ben-1", "ben-2", "ben-3"],

    plans: [
      {
        id: "plan-3",
        membershipProductId: "prod-3",

        subscriptionPlanCode: "SUNRISE-PLATINUM-YEARLY",
        subscriptionPlanName: "Yearly",

        description: "Annual Sunrise Platinum membership",

        subscriptionPeriod: 12,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 9900,
          currency: "CAD",
        },
        currencyId: "currency-cad",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-09-01",

        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,
        versionNo: 1,
      },
    ],

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-prod-2",
    organizationId: "org-glow",

    membershipProductCode: "GLOW-ELITE",
    membershipProductName: "Glow Elite",
    displayName: "Elite",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "Unlimited signature facials and priority everything.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-09-01",

    benefitIds: ["glow-ben-1", "glow-ben-2", "glow-ben-3"],

    plans: [
      {
        id: "glow-plan-2",
        membershipProductId: "glow-prod-2",

        subscriptionPlanCode: "GLOW-ELITE-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly Glow Elite membership",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 12900,
          currency: "USD",
        },
        currencyId: "currency-usd",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-09-01",

        createdAt: now,
        createdBy: "user-system",
        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,
        versionNo: 1,
      },
    ],

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_PRODUCTS,
];

const customers: Customer[] = [
  {
    id: "cust-1",
    fullName: "Ada Baker",
    email: "ada@example.com",
    phone: "+14155550100",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    // Demo persona for the no-membership Business QR journey: owns nothing.
    id: "cust-new-demo",
    fullName: "New Customer Demo",
    email: "newcustomer@example.com",
    phone: "5550102002",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "cust-prospect-1",
    fullName: "Maya Thompson",
    email: "maya@example.com",
    phone: "+14155550222",
    createdAt: "2026-08-10T14:00:00.000Z",
  },
  ...STEEP_SIP_CUSTOMERS,
];

const subscriptions: Subscription[] = [
  {
    id: "sub-1",
    subscriptionNumber: "SUB-2026-0001",

    subscriptionPlanId: "plan-1",
    organizationUserId: "org-user-sunrise-customer-ada",

    subscriptionDate: "2026-02-01",
    startDate: "2026-02-01",
    endDate: "2027-02-01",

    subscriptionStatusId: "entity-status-subscription-active",

    totalAmount: {
      amountMinor: 29900,
      currency: "INR",
    },

    createdAt: "2026-02-01T09:00:00.000Z",
    createdBy: "user-system",

    updatedAt: "2026-02-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "sub-2",
    subscriptionNumber: "SUB-2026-0002",

    subscriptionPlanId: "plan-2",
    organizationUserId: "org-user-sunrise-customer-ada",

    subscriptionDate: "2026-03-01",
    startDate: "2026-03-01",
    endDate: "2026-09-01",

    subscriptionStatusId: "entity-status-subscription-active",

    totalAmount: {
      amountMinor: 19900,
      currency: "INR",
    },

    createdAt: "2026-03-01T09:00:00.000Z",
    createdBy: "user-system",

    updatedAt: "2026-03-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-sub-1",
    subscriptionNumber: "GLOW-2026-0001",

    subscriptionPlanId: "glow-plan-1",
    organizationUserId: "org-user-glow-customer-ada",

    subscriptionDate: "2026-04-01",
    startDate: "2026-04-01",
    endDate: "2026-12-01",

    subscriptionStatusId: "entity-status-subscription-active",

    totalAmount: {
      amountMinor: 5900,
      currency: "USD",
    },

    createdAt: "2026-04-01T09:00:00.000Z",
    createdBy: "user-system",

    updatedAt: "2026-04-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

const redemptions: Redemption[] = [
  {
    id: "red-1",
    redemptionNumber: "RED-2026-0001",

    subscriptionId: "sub-1",
    benefitId: "ben-1",
    storeId: "store-1",
    staffId: "staff-dev-owner",

    method: RedemptionMethod.QR,
    redemptionDateTime: "2026-07-20T14:30:00.000Z",
    quantity: 1,
    redemptionStatusId: "status-success",

    remarks: undefined,

    createdAt: "2026-07-20T14:30:00.000Z",
    createdBy: "staff-dev-owner",

    updatedAt: "2026-07-20T14:30:00.000Z",
    updatedBy: "staff-dev-owner",

    versionNo: 1,
    isDeleted: false,
  },

  {
    id: "red-2",
    redemptionNumber: "RED-2026-0002",

    subscriptionId: "sub-1",
    benefitId: "ben-2",
    storeId: "store-1",
    staffId: "staff-dev-owner",

    method: RedemptionMethod.QR,
    redemptionDateTime: "2026-06-05T09:10:00.000Z",
    quantity: 1,
    redemptionStatusId: "status-success",

    remarks: undefined,

    createdAt: "2026-06-05T09:10:00.000Z",
    createdBy: "staff-dev-owner",

    updatedAt: "2026-06-05T09:10:00.000Z",
    updatedBy: "staff-dev-owner",

    versionNo: 1,
    isDeleted: false,
  },

  {
    id: "glow-red-1",
    redemptionNumber: "RED-2026-0003",

    subscriptionId: "glow-sub-1",
    benefitId: "glow-ben-1",
    storeId: "glow-store-1",
    staffId: "staff-dev-owner",

    method: RedemptionMethod.STAFF_ASSISTED,
    redemptionDateTime: "2026-05-18T11:00:00.000Z",
    quantity: 1,
    redemptionStatusId: "status-success",

    remarks: undefined,

    createdAt: "2026-05-18T11:00:00.000Z",
    createdBy: "staff-dev-owner",

    updatedAt: "2026-05-18T11:00:00.000Z",
    updatedBy: "staff-dev-owner",

    versionNo: 1,
    isDeleted: false,
  },
];

const offers: Offer[] = [
  {
    id: "off-1",
    organizationId: "org-sunrise",

    offerCode: "SUNRISE-WEEKEND-COMBO",
    offerName: "Weekend Croissant Combo",

    description: "Any coffee + croissant for a sweet weekend price.",

    membershipProductId: "prod-2",

    discountPercentage: 10,

    effectiveDate: "2026-09-01",

    statusId: "offer-status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "off-2",
    organizationId: "org-sunrise",

    offerCode: "SUNRISE-DOUBLE-REWARDS",
    offerName: "Double Rewards Tuesday",

    description: "Earn twice the rewards on every visit this Tuesday.",

    effectiveDate: "2026-09-01",

    statusId: "offer-status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "glow-off-1",
    organizationId: "org-glow",

    offerCode: "GLOW-NEW-CLIENT-20",
    offerName: "New Client 20% Off",

    description: "First facial for new members at 20% off.",

    membershipProductId: "glow-prod-1",

    discountPercentage: 20,

    effectiveDate: "2026-09-01",

    statusId: "offer-status-active",

    createdAt: new Date().toISOString(),
    createdBy: "user-system",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
  ...STEEP_SIP_OFFERS,
];

export class InMemoryOrganizationService implements OrganizationService {
  async getOrganization(id: ID): Promise<Organization | null> {
    return ORGANIZATIONS.find((o) => o.id === id) ?? null;
  }
  async getAccount(organizationId: ID): Promise<OrganizationAccount | null> {
    return ACCOUNTS.find((a) => a.organizationId === organizationId) ?? null;
  }
  async getBusinessContext(
    organizationId: ID,
  ): Promise<BusinessContext | null> {
    return BUSINESS_CONTEXTS_BY_ORG[organizationId] ?? null;
  }
  async listStores(organizationId: ID): Promise<Store[]> {
    return stores.filter(
      (store) => store.organizationId === organizationId && !store.isDeleted,
    );
  }
  async listOrganizationUsersByUser(userId: ID): Promise<OrganizationUser[]> {
    return organizationUsers.filter(
      (item) => item.userId === userId && !item.isDeleted,
    );
  }
  async getOrganizationUser(id: ID): Promise<OrganizationUser | null> {
    return (
      organizationUsers.find((item) => item.id === id && !item.isDeleted) ??
      null
    );
  }
  async createStore(organizationId: ID, store: Store): Promise<Store> {
    const now = new Date().toISOString();

    const created: Store = {
      ...store,
      organizationId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      versionNo: 1,
    };

    stores.push(created);

    return created;
  }

  async updateStore(organizationId: ID, store: Store): Promise<Store> {
    const index = stores.findIndex(
      (item) =>
        item.id === store.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Store not found");
    }

    const updated: Store = {
      ...store,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: stores[index].versionNo + 1,
    };

    stores[index] = updated;

    return updated;
  }

  async deleteStore(organizationId: ID, storeId: ID): Promise<void> {
    const index = stores.findIndex(
      (item) =>
        item.id === storeId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Store not found");
    }

    stores[index] = {
      ...stores[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: stores[index].versionNo + 1,
    };
  }
  async listOrganizationUsers(organizationId: ID): Promise<OrganizationUser[]> {
    return organizationUsers.filter(
      (user) => user.organizationId === organizationId && !user.isDeleted,
    );
  }

  async createOrganizationUser(
    organizationId: ID,
    organizationUser: OrganizationUser,
  ): Promise<OrganizationUser> {
    const created: OrganizationUser = {
      ...organizationUser,
      organizationId,
    };

    organizationUsers.push(created);

    return created;
  }

  async listStaff(organizationId: ID): Promise<Staff[]> {
    return staff.filter((item) => item.organizationId === organizationId);
  }

  async createStaff(organizationId: ID, staffRecord: Staff): Promise<Staff> {
    const created: Staff = {
      ...staffRecord,
      organizationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    staff.push(created);
    return created;
  }

  async updateStaff(organizationId: ID, staffRecord: Staff): Promise<Staff> {
    const index = staff.findIndex(
      (item) =>
        item.id === staffRecord.id && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Staff member not found.");
    }

    const updated: Staff = {
      ...staffRecord,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: staffRecord.versionNo + 1,
    };

    staff[index] = updated;
    return updated;
  }

  async deleteStaff(organizationId: ID, staffId: ID): Promise<void> {
    const index = staff.findIndex(
      (item) => item.id === staffId && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Staff member not found.");
    }

    staff[index] = {
      ...staff[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: staff[index].versionNo + 1,
    };
  }

  async getOrganizationDetails(
    organizationId: ID,
  ): Promise<OrganizationDetails | null> {
    return (
      ORGANIZATION_DETAILS.find((d) => d.organizationId === organizationId) ??
      null
    );
  }

  async getOrganizationBranding(
    organizationId: ID,
  ): Promise<OrganizationBranding | null> {
    return (
      ORGANIZATION_BRANDING.find((b) => b.organizationId === organizationId) ??
      null
    );
  }

  async getNotificationConfiguration(
    organizationId: ID,
  ): Promise<NotificationConfiguration | null> {
    return (
      NOTIFICATION_CONFIGURATIONS.find(
        (n) => n.organizationId === organizationId,
      ) ?? null
    );
  }

  async listIntegrationConfigurations(
    organizationId: string,
  ): Promise<IntegrationConfiguration[]> {
    return INTEGRATION_CONFIGURATIONS.filter(
      (configuration) =>
        configuration.organizationId === organizationId &&
        !configuration.isDeleted,
    );
  }

  async createIntegrationConfiguration(
    organizationId: string,
    configuration: IntegrationConfiguration,
  ): Promise<IntegrationConfiguration> {
    const now = new Date().toISOString();

    const created: IntegrationConfiguration = {
      ...configuration,
      organizationId,
      createdAt: now,
      updatedAt: now,
      versionNo: 1,
      isDeleted: false,
    };

    INTEGRATION_CONFIGURATIONS.push(created);

    return created;
  }

  async updateOrganization(
    organizationId: ID,
    organization: Organization,
  ): Promise<Organization> {
    const index = ORGANIZATIONS.findIndex((o) => o.id === organizationId);
    if (index === -1) throw new Error("Organization not found");

    ORGANIZATIONS[index] = organization;
    return organization;
  }

  async updateOrganizationDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<OrganizationDetails> {
    const index = ORGANIZATION_DETAILS.findIndex(
      (d) => d.organizationId === organizationId,
    );
    if (index === -1) throw new Error("Organization details not found");

    ORGANIZATION_DETAILS[index] = details;
    return details;
  }

  async updateOrganizationBranding(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<OrganizationBranding> {
    const index = ORGANIZATION_BRANDING.findIndex(
      (b) => b.organizationId === organizationId,
    );
    if (index === -1) throw new Error("Organization branding not found");

    ORGANIZATION_BRANDING[index] = branding;
    return branding;
  }

  async updateNotificationConfiguration(
    organizationId: ID,
    configuration: NotificationConfiguration,
  ): Promise<NotificationConfiguration> {
    const index = NOTIFICATION_CONFIGURATIONS.findIndex(
      (n) => n.organizationId === organizationId,
    );
    if (index === -1) {
      throw new Error("Notification configuration not found");
    }

    NOTIFICATION_CONFIGURATIONS[index] = configuration;
    return configuration;
  }

  async updateIntegrationConfiguration(
    organizationId: string,
    configuration: IntegrationConfiguration,
  ): Promise<IntegrationConfiguration> {
    const index = INTEGRATION_CONFIGURATIONS.findIndex(
      (item) =>
        item.id === configuration.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Integration configuration not found.");
    }

    const updated: IntegrationConfiguration = {
      ...configuration,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: INTEGRATION_CONFIGURATIONS[index].versionNo + 1,
    };

    INTEGRATION_CONFIGURATIONS[index] = updated;

    return updated;
  }
  async deleteIntegrationConfiguration(
    organizationId: string,
    configurationId: string,
  ): Promise<void> {
    const index = INTEGRATION_CONFIGURATIONS.findIndex(
      (item) =>
        item.id === configurationId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Integration configuration not found.");
    }

    INTEGRATION_CONFIGURATIONS[index] = {
      ...INTEGRATION_CONFIGURATIONS[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: INTEGRATION_CONFIGURATIONS[index].versionNo + 1,
    };
  }

  async listOrganizations(): Promise<Organization[]> {
    return ORGANIZATIONS.filter((organization) => !organization.isDeleted).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }

  async onboardOrganization(
    input: OnboardOrganizationInput,
  ): Promise<OnboardOrganizationResult> {
    const name = input.name.trim();

    if (!name) {
      throw new Error("Business name is required.");
    }

    if (name.length < 2) {
      throw new Error("Business name must contain at least 2 characters.");
    }

    if (name.length > 150) {
      throw new Error("Business name must not exceed 150 characters.");
    }

    const template = getDefaultBusinessTemplate(input.organizationTypeId);

    const now = new Date().toISOString();

    const organizationId: ID = `org-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const organizationCategory = template.template.category;

    const organization: Organization = {
      id: organizationId,

      code: organizationId.replace(/^org-/, "").toUpperCase(),

      name,

      displayName: name,

      organizationTypeId: input.organizationTypeId,

      organizationStatusId: "org-status-active",

      category: organizationCategory,

      primaryEmail: "support@example.com",

      primaryPhone: {
        countryId: "country-ca",
        callingCode: "+1",
        number: "0000000000",
      },

      website: undefined,

      createdAt: now,
      createdBy: "platform-system",

      updatedAt: now,
      updatedBy: "platform-system",

      isDeleted: false,
      versionNo: 1,
    };

    const account: OrganizationAccount = {
      organizationId: organization.id,

      planTier: PlanTier.PRO,

      managementModel: ManagementModel.SELF_SERVICE,
    };

    /*
     * Initialize organization configuration from the
     * selected platform template.
     *
     * These values now belong to the organization.
     */
    const configuration: BusinessConfiguration = {
      templateId: template.template.id,

      identity: {
        displayName: name,

        category: organizationCategory,
      },

      branding: {
        logoUrl: "https://placeholder.memgine.app/logos/business.png",

        primaryColor: "#2563EB",

        secondaryColor: "#64748B",
      },

      customerExperience: {
        welcomeMessage: `Welcome to ${name}!`,

        cardStyle: CardStyle.MODERN,

        showOffers: true,
        showStores: true,
        showActivity: true,
      },

      localization: {
        defaultLanguage: "en-CA",

        defaultCurrency: "CAD",

        timezone: "America/Toronto",
      },
    };

    /*
     * Build the application BusinessContext.
     *
     * The template is the Memgine definition.
     * The organization/account/configuration are new
     * organization-owned values.
     */
    const context: BusinessContext = {
      organization,

      account,

      configuration,

      template: template.template,
    };

    /*
     * Copy the platform starter content into the
     * organization-owned content registry.
     */
    registerBusinessContent(
      organization.id,
      cloneBusinessContent(template.content),
    );

    /*
     * Register the new organization in the current
     * in-memory API/data implementation.
     */
    ORGANIZATIONS.push(organization);

    ACCOUNTS.push(account);

    BUSINESS_CONTEXTS_BY_ORG[organization.id] = context;

    registerBusinessContext(context);

    console.log("MOCK API ORGANIZATION ONBOARDED", {
      organizationId: organization.id,

      organizationName: organization.name,

      organizationTypeId: organization.organizationTypeId,

      templateId: template.id,
    });

    return {
      organization,
      account,
      context,
    };
  }
}

export class InMemoryCustomerService implements CustomerService {
  async getCustomer(id: ID): Promise<Customer | null> {
    return customers.find((c) => c.id === id) ?? null;
  }
  async findCustomers(query: CustomerLookupQuery): Promise<Customer[]> {
    return customers.filter(
      (c) =>
        (!query.email || c.email === query.email) &&
        (!query.phone || c.phone === query.phone) &&
        (!query.nameContains ||
          c.fullName.toLowerCase().includes(query.nameContains.toLowerCase())),
    );
  }
  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const customer: Customer = {
      id: genId("cust"),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      createdAt: new Date().toISOString(),
    };
    customers.push(customer);
    return customer;
  }
}

export class InMemoryMembershipProductService implements MembershipProductService {
  async listProducts(organizationId: ID): Promise<MembershipProduct[]> {
    return products.filter(
      (p) => p.organizationId === organizationId && !p.isDeleted,
    );
  }

  async getProduct(id: ID): Promise<MembershipProduct | null> {
    return products.find((p) => p.id === id && !p.isDeleted) ?? null;
  }

  async createProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const created: MembershipProduct = {
      ...product,
      organizationId,
    };

    products.push(created);

    return created;
  }

  async updateProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const index = products.findIndex(
      (p) => p.id === product.id && p.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Membership product not found.");
    }

    const updated: MembershipProduct = {
      ...product,
      organizationId,
      versionNo: product.versionNo + 1,
      updatedAt: new Date().toISOString(),
    };

    products[index] = updated;

    return updated;
  }

  async deleteProduct(organizationId: ID, productId: ID): Promise<void> {
    const index = products.findIndex(
      (p) => p.id === productId && p.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Membership product not found.");
    }

    products[index] = {
      ...products[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: products[index].versionNo + 1,
    };
  }
}

export class InMemorySubscriptionService implements SubscriptionService {
  async listByCustomer(customerId: ID): Promise<Subscription[]> {
    /**
     * Customer/User → OrganizationUser → Subscription
     *
     * Subscription no longer contains customerId directly.
     */
    const organizationUserIds = new Set(
      organizationUsers
        .filter(
          (organizationUser) =>
            organizationUser.userId === customerId &&
            !organizationUser.isDeleted,
        )
        .map((organizationUser) => organizationUser.id),
    );

    return subscriptions.filter(
      (subscription) =>
        !subscription.isDeleted &&
        organizationUserIds.has(subscription.organizationUserId),
    );
  }

  async listByOrganizationUser(
    organizationUserId: ID,
  ): Promise<Subscription[]> {
    return subscriptions.filter(
      (subscription) =>
        !subscription.isDeleted &&
        subscription.organizationUserId === organizationUserId,
    );
  }

  async listByOrganization(organizationId: ID): Promise<Subscription[]> {
    /**
     * Organization → OrganizationUser → Subscription
     */
    const organizationUserIds = new Set(
      organizationUsers
        .filter(
          (organizationUser) =>
            organizationUser.organizationId === organizationId &&
            !organizationUser.isDeleted,
        )
        .map((organizationUser) => organizationUser.id),
    );

    return subscriptions.filter(
      (subscription) =>
        !subscription.isDeleted &&
        organizationUserIds.has(subscription.organizationUserId),
    );
  }

  async getSubscription(id: ID): Promise<Subscription | null> {
    return (
      subscriptions.find(
        (subscription) => subscription.id === id && !subscription.isDeleted,
      ) ?? null
    );
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const now = new Date().toISOString();

    const subscription: Subscription = {
      id: genId("sub"),

      subscriptionNumber: input.subscriptionNumber,
      subscriptionPlanId: input.subscriptionPlanId,
      organizationUserId: input.organizationUserId,

      subscriptionDate: input.subscriptionDate,
      startDate: input.startDate,
      endDate: input.endDate,

      subscriptionStatusId: input.subscriptionStatusId,

      totalAmount: input.totalAmount,

      createdAt: now,
      createdBy: input.createdBy,

      updatedAt: now,
      updatedBy: input.createdBy,

      isDeleted: false,
      versionNo: 1,
    };

    subscriptions.push(subscription);

    return subscription;
  }
}

export class InMemorySubscriptionPlanService implements SubscriptionPlanService {
  async getPlan(id: ID): Promise<SubscriptionPlan | null> {
    for (const product of products) {
      const plan = product.plans?.find(
        (item) => item.id === id && !item.isDeleted,
      );

      if (plan) {
        return plan;
      }
    }

    return null;
  }

  async listByProduct(membershipProductId: ID): Promise<SubscriptionPlan[]> {
    const product = products.find(
      (item) => item.id === membershipProductId && !item.isDeleted,
    );

    return product?.plans?.filter((plan) => !plan.isDeleted) ?? [];
  }
}

export class InMemoryBenefitService implements BenefitService {
  async listByOrganization(organizationId: ID): Promise<Benefit[]> {
    return benefits.filter(
      (benefit) =>
        benefit.organizationId === organizationId && !benefit.isDeleted,
    );
  }

  async listByProduct(membershipProductId: ID): Promise<Benefit[]> {
    const product = products.find((item) => item.id === membershipProductId);

    if (!product) {
      return [];
    }

    return benefits.filter(
      (benefit) =>
        product.benefitIds.includes(benefit.id) && !benefit.isDeleted,
    );
  }

  async createBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const now = new Date().toISOString();

    const created: Benefit = {
      ...benefit,
      id: benefit.id || genId("ben"),
      organizationId,
      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",
      isDeleted: false,
      versionNo: 1,
    };

    benefits.push(created);

    return created;
  }

  async updateBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const index = benefits.findIndex(
      (item) =>
        item.id === benefit.id && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Benefit not found.");
    }

    const current = benefits[index];

    const updated: Benefit = {
      ...benefit,
      organizationId,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: new Date().toISOString(),
      updatedBy: "user-system",
      versionNo: current.versionNo + 1,
    };

    benefits[index] = updated;

    return updated;
  }

  async deleteBenefit(organizationId: ID, benefitId: ID): Promise<void> {
    const index = benefits.findIndex(
      (item) => item.id === benefitId && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Benefit not found.");
    }

    const current = benefits[index];

    benefits[index] = {
      ...current,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      updatedBy: "user-system",
      versionNo: current.versionNo + 1,
    };
  }
}

class InMemoryRedemptionService implements RedemptionService {
  constructor(private readonly statusService: StatusService) {}

  private async getAllowedStatus(statusCode: string): Promise<Status> {
    const statuses =
      await this.statusService.listStatusesByEntityTypeCode("REDEMPTION");

    const status = statuses.find(
      (item) => item.statusCode.toUpperCase() === statusCode.toUpperCase(),
    );

    if (!status) {
      throw new Error(
        `Status '${statusCode}' is not configured for Redemption.`,
      );
    }

    return status;
  }

  async performRedemption(input: PerformRedemptionInput): Promise<Redemption> {
    const successStatus = await this.getAllowedStatus("SUCCESS");

    const now = new Date().toISOString();

    const redemption: Redemption = {
      id: `red-${Date.now()}`,
      redemptionNumber: `RED-${Date.now()}`,

      subscriptionId: input.subscriptionId,
      benefitId: input.benefitId,
      storeId: input.storeId,
      staffId: input.staffId,

      method: input.method,
      redemptionDateTime: now,
      quantity: input.quantity ?? 1,

      redemptionStatusId: successStatus.id,

      remarks: input.remarks,

      createdAt: now,
      createdBy: input.createdBy,

      updatedAt: now,
      updatedBy: input.createdBy,

      versionNo: 1,
      isDeleted: false,
    };

    redemptions.push(redemption);

    return redemption;
  }

  async listBySubscription(subscriptionId: ID): Promise<Redemption[]> {
    return redemptions.filter(
      (redemption) =>
        redemption.subscriptionId === subscriptionId && !redemption.isDeleted,
    );
  }
}

/**
 * Mock customer OTP auth. NOT a real SMS/auth provider. Returns a dev code so
 * the UI can display it. Identifies the existing mock customer on success.
 */
export class InMemoryCustomerAuthService implements CustomerAuthService {
  private codes = new Map<
    string,
    {
      code: string;
      mobile: string;
    }
  >();

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const requestId = genId("otp");
    const devCode = String(Math.floor(100000 + Math.random() * 900000));

    this.codes.set(requestId, {
      code: devCode,
      mobile: input.mobile.trim(),
    });

    return {
      requestId,
      devCode,
    };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const entry = this.codes.get(input.requestId);

    const verified = !!entry && entry.code === input.code.trim();

    if (!verified) {
      return {
        verified: false,
      };
    }

    this.codes.delete(input.requestId);

    /*
     * Authentication verifies the mobile.
     *
     * Customer identity is resolved by CustomerService after OTP
     * verification. Therefore this service deliberately does NOT
     * manufacture or return "cust-1".
     */
    return {
      verified: true,
    };
  }
}

/**
 * Mock payment. NOT a real gateway/vendor. Always succeeds and returns a
 * reference. Provider-neutral so a real processor can replace it later.
 */
export class InMemoryPaymentService implements PaymentService {
  async pay(request: PaymentRequest): Promise<PaymentResult> {
    return { status: "PAID", reference: genId("pay").toUpperCase() };
  }
}

export class InMemoryOfferService implements OfferService {
  async listByOrganization(organizationId: ID): Promise<Offer[]> {
    return offers.filter(
      (offer) => offer.organizationId === organizationId && !offer.isDeleted,
    );
  }

  async createOffer(organizationId: ID, offer: Offer): Promise<Offer> {
    if (offer.organizationId !== organizationId) {
      throw new Error("Offer does not belong to the selected organization.");
    }

    const duplicateCode = offers.some(
      (item) =>
        item.organizationId === organizationId &&
        !item.isDeleted &&
        item.offerCode.toLowerCase() === offer.offerCode.toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Offer code "${offer.offerCode}" already exists.`);
    }

    offers.push(offer);

    return offer;
  }

  async updateOffer(organizationId: ID, offer: Offer): Promise<Offer> {
    const index = offers.findIndex(
      (item) => item.id === offer.id && item.organizationId === organizationId,
    );

    if (index < 0) {
      throw new Error("Offer not found.");
    }

    const duplicateCode = offers.some(
      (item) =>
        item.id !== offer.id &&
        item.organizationId === organizationId &&
        !item.isDeleted &&
        item.offerCode.toLowerCase() === offer.offerCode.toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Offer code "${offer.offerCode}" already exists.`);
    }

    const updated: Offer = {
      ...offer,
      versionNo: offers[index].versionNo + 1,
    };

    offers[index] = updated;

    return updated;
  }

  async deleteOffer(organizationId: ID, offerId: ID): Promise<void> {
    const index = offers.findIndex(
      (item) => item.id === offerId && item.organizationId === organizationId,
    );

    if (index < 0) {
      throw new Error("Offer not found.");
    }

    offers[index] = {
      ...offers[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      updatedBy: "user-system",
      versionNo: offers[index].versionNo + 1,
    };
  }
}

export class InMemoryUserAcquisitionService implements UserAcquisitionService {
  async getByUser(userId: ID): Promise<UserAcquisition[]> {
    return userAcquisitions.filter(
      (item) => item.userId === userId && !item.isDeleted,
    );
  }

  async listByOrganization(organizationId: ID): Promise<UserAcquisition[]> {
    const organizationStoreIds = new Set(
      stores
        .filter(
          (store) =>
            store.organizationId === organizationId && !store.isDeleted,
        )
        .map((store) => store.id),
    );

    return userAcquisitions.filter(
      (item) =>
        !item.isDeleted &&
        (!item.sourceStoreId || organizationStoreIds.has(item.sourceStoreId)),
    );
  }

  async listBySourceStore(storeId: ID): Promise<UserAcquisition[]> {
    return userAcquisitions.filter(
      (item) => !item.isDeleted && item.sourceStoreId === storeId,
    );
  }

  async createAcquisition(
    acquisition: UserAcquisition,
  ): Promise<UserAcquisition> {
    userAcquisitions.push(acquisition);
    return acquisition;
  }
}

/** Convenience aggregate of the mock services (compile-demonstration only). */
export const mockServices = {
  organization: new InMemoryOrganizationService(),
  customer: new InMemoryCustomerService(),
  membershipProduct: new InMemoryMembershipProductService(),
  subscription: new InMemorySubscriptionService(),
  subscriptionPlan: new InMemorySubscriptionPlanService(),
  benefit: new InMemoryBenefitService(),
  redemption: new InMemoryRedemptionService(mockStatusService),
  offer: new InMemoryOfferService(),
  auth: new InMemoryCustomerAuthService(),
  payment: new InMemoryPaymentService(),
  userAcquisition: new InMemoryUserAcquisitionService(),
};
