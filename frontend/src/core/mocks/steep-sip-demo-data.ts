import { ID } from "../domain/common";
import {
  Benefit,
  Customer,
  MembershipProduct,
  Offer,
  OrganizationUser,
  Staff,
  Store,
  UserAcquisition,
} from "../domain/entities";
import {
  DEFAULT_ROLE_CAPABILITIES,
  StaffRole,
} from "../permissions/permissions";

/**
 * ---------------------------------------------------------------------------
 * STEEP & SIP — DEMO DATA
 * ---------------------------------------------------------------------------
 *
 * This file contains ONLY demo/domain data for STEEP & SIP.
 *
 * Existing Sunrise Bakery and Glow Studio mock data remains untouched.
 *
 * STEEP & SIP uses the default F&B Bakery template through:
 *
 *   steep-sip.ts
 *       -> F_AND_B_BAKERY_V1
 *
 * Customer subscriptions and redemptions are intentionally NOT seeded here.
 * Those are created during the end-to-end demo.
 * ---------------------------------------------------------------------------
 */

const ORG_ID = "org-steep-sip";
const STORE_ID = "store-steep-sip-main";

const OWNER_ORG_USER_ID = "org-user-steep-sip-owner";
const MANAGER_ORG_USER_ID = "org-user-steep-sip-manager";
const COUNTER_ORG_USER_ID = "org-user-steep-sip-counter";

const OWNER_USER_ID = "user-steep-sip-owner";
const MANAGER_USER_ID = "user-steep-sip-manager";
const COUNTER_USER_ID = "user-steep-sip-counter";

const now = new Date().toISOString();

/* ---------------------------------------------------------------------------
 * Store
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_STORES: Store[] = [
  {
    id: STORE_ID,
    organizationId: ORG_ID,

    storeCode: "STEEP-SIP-001",
    name: "STEEP & SIP — Main Store",
    storeTypeId: "store-type-cafe",

    phoneNumber: {
      countryId: "country-in",
      callingCode: "+91",
      number: "9000010001",
    },
    emailAddress: "main@steepandsip.demo",

    address: {
      line1: "12 Artisan Street",
      line2: "",
      city: "Mumbai",
      region: "Maharashtra",
      postalCode: "400001",
      countryCode: "IN",
    },

    timezone: "Asia/Kolkata",

    storeStatusId: "store-status-active",

    openingDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/* ---------------------------------------------------------------------------
 * Organization Users
 *
 * These represent the organization's relationships with its users.
 * Staff records below point to these records.
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_ORGANIZATION_USERS: OrganizationUser[] = [
  {
    id: OWNER_ORG_USER_ID,
    organizationId: ORG_ID,
    userId: OWNER_USER_ID,

    organizationUserTypeId: "org-user-type-owner",
    organizationUserStatusId: "status-active",

    joiningDate: "2026-08-01T09:00:00.000Z",

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: MANAGER_ORG_USER_ID,
    organizationId: ORG_ID,
    userId: MANAGER_USER_ID,

    organizationUserTypeId: "org-user-type-staff",
    organizationUserStatusId: "status-active",

    joiningDate: "2026-08-01T09:00:00.000Z",

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: COUNTER_ORG_USER_ID,
    organizationId: ORG_ID,
    userId: COUNTER_USER_ID,

    organizationUserTypeId: "org-user-type-staff",
    organizationUserStatusId: "status-active",

    joiningDate: "2026-08-01T09:00:00.000Z",

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/* ---------------------------------------------------------------------------
 * Staff
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_STAFF: Staff[] = [
  {
    id: "staff-steep-sip-owner",
    organizationId: ORG_ID,
    organizationUserId: OWNER_ORG_USER_ID,

    staffCode: "STEEP-001",

    designation: "Owner",

    storeId: STORE_ID,

    joiningDate: "2026-08-01T09:00:00.000Z",
    relievingDate: undefined,

    staffStatusId: "staff-status-active",

    role: StaffRole.OWNER,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.OWNER],
    isActive: true,

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "staff-steep-sip-manager",
    organizationId: ORG_ID,
    organizationUserId: MANAGER_ORG_USER_ID,

    staffCode: "STEEP-002",
    designation: "Store Manager",

    storeId: STORE_ID,

    joiningDate: "2026-08-01T09:00:00.000Z",
    relievingDate: undefined,

    staffStatusId: "staff-status-active",

    role: StaffRole.MANAGER,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.MANAGER],
    isActive: true,

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "staff-steep-sip-counter",
    organizationId: ORG_ID,
    organizationUserId: COUNTER_ORG_USER_ID,

    staffCode: "STEEP-003",
    designation: "Counter Staff",

    storeId: STORE_ID,

    joiningDate: "2026-08-01T09:00:00.000Z",
    relievingDate: undefined,

    staffStatusId: "staff-status-active",

    role: StaffRole.STAFF,
    capabilities: DEFAULT_ROLE_CAPABILITIES[StaffRole.STAFF],
    isActive: true,

    createdAt: "2026-08-01T09:00:00.000Z",
    createdBy: "user-system",
    updatedAt: "2026-08-01T09:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/* ---------------------------------------------------------------------------
 * Benefits
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_BENEFITS: Benefit[] = [
  {
    id: "steep-ben-daily-coffee",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-DAILY-COFFEE",
    benefitName: "Daily Artisan Coffee",
    displayName: "Daily artisan coffee",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-freebie",

    description: "One complimentary artisan coffee every day.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-ben-pastry-10",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-PASTRY-10",
    benefitName: "10% Pastry Discount",
    displayName: "10% off pastries",

    benefitCategoryId: "benefit-category-discount",
    benefitTypeId: "benefit-type-discount",

    description: "10% off selected pastries and bakery items.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-ben-pastry-15",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-PASTRY-15",
    benefitName: "15% Pastry Discount",
    displayName: "15% off pastries",

    benefitCategoryId: "benefit-category-discount",
    benefitTypeId: "benefit-type-discount",

    description: "15% off selected pastries and bakery items.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-ben-monthly-pastry",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-MONTHLY-PASTRY",
    benefitName: "Complimentary Monthly Pastry",
    displayName: "Free monthly pastry",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-freebie",

    description: "One complimentary bakery item every membership month.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-ben-birthday",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-BIRTHDAY",
    benefitName: "Birthday Treat",
    displayName: "Complimentary birthday treat",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-freebie",

    description:
      "A complimentary birthday treat during the customer's birthday month.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-ben-weekend",
    organizationId: ORG_ID,

    benefitCode: "ARTISAN-WEEKEND",
    benefitName: "Weekend Coffee Special",
    displayName: "Weekend coffee special",

    benefitCategoryId: "benefit-category-food",
    benefitTypeId: "benefit-type-perk",

    description: "A special weekend-only coffee benefit for Platinum members.",

    benefitStatusId: "benefit-status-active",

    effectiveDate: "2026-08-01",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/* ---------------------------------------------------------------------------
 * Membership Products
 *
 * Three separate MembershipProduct records:
 *
 *   ARTISAN PASS — SILVER
 *   ARTISAN PASS — GOLD
 *   ARTISAN PASS — PLATINUM
 *
 * GOLD is intentionally the strongest demo/product-specific promotion.
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_PRODUCTS: MembershipProduct[] = [
  {
    id: "steep-product-silver",
    organizationId: ORG_ID,

    membershipProductCode: "ARTISAN-PASS-SILVER",
    membershipProductName: "ARTISAN PASS — SILVER",
    displayName: "Silver",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description: "A simple everyday membership for coffee and bakery lovers.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-08-01",

    benefitIds: ["steep-ben-daily-coffee", "steep-ben-pastry-10"],

    plans: [
      {
        id: "steep-plan-silver",
        membershipProductId: "steep-product-silver",

        subscriptionPlanCode: "ARTISAN-PASS-SILVER-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly ARTISAN PASS Silver membership.",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 29900,
          currency: "INR",
        },
        currencyId: "currency-inr",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-08-01",

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
    id: "steep-product-gold",
    organizationId: ORG_ID,

    membershipProductCode: "ARTISAN-PASS-GOLD",
    membershipProductName: "ARTISAN PASS — GOLD",
    displayName: "Gold",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description:
      "The signature STEEP & SIP membership with richer coffee and bakery benefits.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-08-01",

    benefitIds: [
      "steep-ben-daily-coffee",
      "steep-ben-pastry-15",
      "steep-ben-monthly-pastry",
      "steep-ben-birthday",
    ],

    plans: [
      {
        id: "steep-plan-gold",
        membershipProductId: "steep-product-gold",

        subscriptionPlanCode: "ARTISAN-PASS-GOLD-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly ARTISAN PASS Gold membership.",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 59900,
          currency: "INR",
        },
        currencyId: "currency-inr",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-08-01",

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
    id: "steep-product-platinum",
    organizationId: ORG_ID,

    membershipProductCode: "ARTISAN-PASS-PLATINUM",
    membershipProductName: "ARTISAN PASS — PLATINUM",
    displayName: "Platinum",

    productCategoryId: "product-category-membership",
    productTypeId: "product-type-individual",

    description:
      "The complete STEEP & SIP experience with premium everyday and weekend benefits.",

    productStatusId: "product-status-active",

    effectiveDate: "2026-08-01",

    benefitIds: [
      "steep-ben-daily-coffee",
      "steep-ben-pastry-15",
      "steep-ben-monthly-pastry",
      "steep-ben-birthday",
      "steep-ben-weekend",
    ],

    plans: [
      {
        id: "steep-plan-platinum",
        membershipProductId: "steep-product-platinum",

        subscriptionPlanCode: "ARTISAN-PASS-PLATINUM-MONTHLY",
        subscriptionPlanName: "Monthly",

        description: "Monthly ARTISAN PASS Platinum membership.",

        subscriptionPeriod: 1,
        subscriptionPeriodUnit: "MONTH",

        price: {
          amountMinor: 89900,
          currency: "INR",
        },
        currencyId: "currency-inr",

        subscriptionPlanStatusId: "subscription-plan-status-active",

        effectiveDate: "2026-08-01",

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
];

/* ---------------------------------------------------------------------------
 * Demo customer
 *
 * No subscription is seeded. The purchase journey creates the subscription.
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_CUSTOMERS: Customer[] = [
  {
    id: "cust-steep-sip-demo",
    fullName: "Maya Kapoor",
    email: "maya@steepandsip.demo",
    phone: "+919900010001",
    createdAt: "2026-08-17T10:00:00.000Z",
  },
];

/* ---------------------------------------------------------------------------
 * Customer's organization relationship
 *
 * This is needed so that a subscription created during the demo can resolve:
 *
 * Subscription
 *      ↓
 * OrganizationUser
 *      ↓
 * STEEP & SIP + Customer
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_CUSTOMER_ORGANIZATION_USER: OrganizationUser = {
  id: "org-user-steep-sip-customer-demo",

  organizationId: ORG_ID,
  userId: "cust-steep-sip-demo",

  organizationUserTypeId: "org-user-type-customer",
  organizationUserStatusId: "status-active",

  joiningDate: "2026-08-17T10:00:00.000Z",

  createdAt: "2026-08-17T10:00:00.000Z",
  createdBy: "user-system",

  updatedAt: "2026-08-17T10:00:00.000Z",
  updatedBy: "user-system",

  isDeleted: false,
  versionNo: 1,
};

/* ---------------------------------------------------------------------------
 * Acquisition
 *
 * This represents the customer entering through the store scanner.
 * It does NOT create the subscription.
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_USER_ACQUISITIONS: UserAcquisition[] = [
  {
    id: "user-acq-steep-sip-demo",

    userId: "cust-steep-sip-demo",
    organizationId: ORG_ID,

    registrationSource: "STORE_SCANNER",
    registrationChannel: "QR_CODE",

    sourceStoreId: STORE_ID,

    createdAt: "2026-08-17T10:00:00.000Z",
    createdBy: "user-system",

    updatedAt: "2026-08-17T10:00:00.000Z",
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];

/* ---------------------------------------------------------------------------
 * Promotions / Offers
 *
 * 1. Product-specific:
 *      directly targets ARTISAN PASS GOLD
 *
 * 2. Organization-wide:
 *      no membershipProductId, so the customer can choose
 *      Silver / Gold / Platinum.
 *
 * These are the two acquisition scenarios we want to demonstrate.
 * ------------------------------------------------------------------------- */

export const STEEP_SIP_OFFERS: Offer[] = [
  {
    id: "steep-offer-gold-scan",
    organizationId: ORG_ID,

    offerCode: "ARTISAN-GOLD-SCAN",
    offerName: "Discover ARTISAN PASS GOLD",

    description:
      "Scan to discover the signature ARTISAN PASS Gold membership at STEEP & SIP.",

    membershipProductId: "steep-product-gold",
    storeId: STORE_ID,

    effectiveDate: "2026-08-01",

    statusId: "offer-status-active",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },

  {
    id: "steep-offer-membership",
    organizationId: ORG_ID,

    offerCode: "STEEP-SIP-MEMBERSHIP",
    offerName: "Join STEEP & SIP",

    description:
      "Discover ARTISAN PASS Silver, Gold and Platinum membership options.",

    storeId: STORE_ID,

    effectiveDate: "2026-08-01",

    statusId: "offer-status-active",

    createdAt: now,
    createdBy: "user-system",
    updatedAt: now,
    updatedBy: "user-system",

    isDeleted: false,
    versionNo: 1,
  },
];
