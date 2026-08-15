import { Capability, StaffRole } from "../permissions/permissions";

import {
  Address,
  PhoneNumber,
  BillingInterval,
  ID,
  ISODateString,
  Money,
  TemplateCategory,
} from "./common";

/* ------------------------------------------------------------------ *
 * Organization + account / platform context
 * ------------------------------------------------------------------ */

/** Commercial plan tier — account/platform context, NOT BusinessConfiguration. */
export enum PlanTier {
  BASIC = "BASIC",
  PRO = "PRO",
  ENTERPRISE = "ENTERPRISE",
}

/** How the account is operated — account/platform context. */
export enum ManagementModel {
  SELF_SERVICE = "SELF_SERVICE",
  MANAGED_SERVICE = "MANAGED_SERVICE",
}

/** The business tenant. */
export interface Organization {
  id: ID;
  code: string;
  name: string;
  legalName?: string;
  displayName: string;

  organizationTypeId: ID;
  organizationStatusId: ID;

  category: TemplateCategory;

  primaryEmail: string;
  primaryPhone: PhoneNumber;
  website?: string;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/** The business tenant more details. */
export interface OrganizationDetails {
  id: ID;
  organizationId: ID;

  registrationNumber: string;
  gstNumber: string;
  supportEmail: string;
  supportPhone: PhoneNumber;

  aboutOrganization: string;
  address: Address;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}
/** The business branding information */
export interface OrganizationBranding {
  id: ID;
  organizationId: ID;

  brandingName: string;
  themeTemplateId: ID;

  logoUrl?: string;
  darkThemeLogoUrl?: string;
  faviconUrl?: string;
  splashScreenImageUrl?: string;

  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;

  brandingStatusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt?: ISODateString;
  updatedBy?: ID;

  isDeleted: boolean;
  versionNo: number;
}

/** The business notification configuration */
export interface NotificationConfiguration {
  id: ID;
  organizationId: ID;

  configurationName: string;

  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;

  notificationStatusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt?: ISODateString;
  updatedBy?: ID;

  isDeleted: boolean;
  versionNo: number;
}

/** The business  configuration to connect with external entities */
export interface IntegrationConfiguration {
  id: ID;
  organizationId: ID;

  integrationName: string;
  integrationTypeId: ID;
  provider: string;

  integrationStatusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt?: ISODateString;
  updatedBy?: ID;

  isDeleted: boolean;
  versionNo: number;
}
/** The business  integration configuration  type to connect with external entities */
export interface IntegrationType {
  id: string;
  code: string;
  name: string;
  description?: string;
  displaySequence: number;
  statusId: string;

  createdAt: string;
  updatedAt: string;

  isDeleted: boolean;
  versionNumber: number;
}

/**
 * Platform/account context for an organization. Kept separate from
 * BusinessConfiguration and from any commercial billing system.
 */
export interface OrganizationAccount {
  organizationId: ID;
  planTier: PlanTier;
  managementModel: ManagementModel;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export interface Store {
  id: ID;
  organizationId: ID;

  storeCode: string;
  name: string;
  storeTypeId: ID;

  phoneNumber?: string;
  emailAddress?: string;

  address: Address;
  timezone: string;

  storeStatusId: ID;

  openingDate?: string;
  closingDate?: string;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy?: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Customer — platform-level identity. A customer's relationship to a
 * business is expressed through a Subscription, not by ownership here.
 * ------------------------------------------------------------------ */

export interface Customer {
  id: ID;
  fullName: string;
  email?: string;
  phone?: string;
  createdAt: ISODateString;
}

/* ------------------------------------------------------------------ *
 * Staff — access is capability-based (see permissions module).
 * ------------------------------------------------------------------ */

export interface Staff {
  id: ID;
  organizationId: ID;
  organizationUserId: ID;

  staffCode: string;
  fullName: string;
  designation?: string;

  storeId?: ID;

  joiningDate: ISODateString;
  relievingDate?: ISODateString;
  staffStatusId: ID;

  role: StaffRole;
  capabilities: Capability[];
  isActive: boolean;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/** Organization User - User belongs to organization **/

export interface OrganizationUser {
  id: ID;
  organizationId: ID;
  userId: ID;
  organizationUserTypeId: ID;
  organizationUserStatusId: ID;
  joiningDate: ISODateString;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * MembershipProduct — the product a business SELLS (NOT the customer's
 * subscription). Do not collapse with Subscription.
 * ------------------------------------------------------------------ */

export interface SubscriptionPlan {
  id: ID;
  membershipProductId: ID;

  subscriptionPlanCode: string;
  subscriptionPlanName: string;

  description?: string;

  subscriptionPeriod: number;
  subscriptionPeriodUnit: string;

  price: Money;
  currencyId: ID;

  subscriptionPlanStatusId: ID;

  effectiveDate: string;
  expiryDate?: string;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

export interface MembershipProduct {
  id: ID;
  organizationId: ID;

  membershipProductCode: string;
  membershipProductName: string;
  displayName?: string;

  productCategoryId: ID;
  productTypeId: ID;

  description?: string;

  productStatusId: ID;

  effectiveDate: string;
  expiryDate?: string;

  /**
   * Benefits attached to this membership product.
   */
  benefitIds: ID[];

  /**
   * Subscription plans available for this membership product.
   */
  plans: SubscriptionPlan[];

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Benefit
 * ------------------------------------------------------------------ */

export enum BenefitType {
  DISCOUNT = "DISCOUNT",
  FREEBIE = "FREEBIE",
  REWARD = "REWARD",
  PERK = "PERK",
}

export interface BenefitValidity {
  startsAt?: ISODateString;
  endsAt?: ISODateString;
  /** Free-form recurrence hint, e.g. "birthday-month". */
  recurrence?: string;
}

export interface Benefit {
  id: ID;
  organizationId: ID;

  benefitCode: string;
  benefitName: string;
  displayName?: string;

  benefitCategoryId: ID;
  benefitTypeId: ID;

  description?: string;

  benefitStatusId: ID;

  effectiveDate: string;
  expiryDate?: string;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Offer — promotional, may target membership products.
 * ------------------------------------------------------------------ */

export interface Offer {
  id: ID;
  organizationId: ID;

  offerCode: string;
  offerName: string;
  description?: string;

  membershipProductId?: ID;
  storeId?: ID;

  discountPercentage?: number;

  effectiveDate: string;
  expiryDate?: string;

  statusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Subscription — the CUSTOMER's subscription to a MembershipProduct.
 * "My Cards" (customer UI) is a view over a customer's subscriptions.
 * ------------------------------------------------------------------ */

export enum SubscriptionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export interface Subscription {
  id: ID;
  organizationId: ID;
  customerId: ID;
  membershipProductId: ID;
  planId: ID;
  status: SubscriptionStatus;
  startedAt: ISODateString;
  currentPeriodEnd?: ISODateString;
  /** Purchase attribution (mirrors redemption attribution). */
  source?: PurchaseSource;
  soldByStaffId?: ID;
  storeId?: ID;
  paymentMethod?: PaymentMethod;
}

/** How a membership purchase was initiated. */
export enum PurchaseSource {
  CUSTOMER = "CUSTOMER",
  STAFF_ASSISTED = "STAFF_ASSISTED",
}

/** Mock payment method for staff-assisted sales. */
export enum PaymentMethod {
  UPI = "UPI",
  CARD = "CARD",
  CASH = "CASH",
}

/* ------------------------------------------------------------------ *
 * Redemption — a benefit redeemed against a subscription, at a store,
 * by a staff member.
 * ------------------------------------------------------------------ */

export enum RedemptionStatus {
  COMPLETED = "COMPLETED",
  VOID = "VOID",
}

/** How a redemption was performed at the counter. */
export enum RedemptionMethod {
  QR = "QR",
  OTP = "OTP",
  STAFF_ASSISTED = "STAFF_ASSISTED",
}

export interface Redemption {
  id: ID;
  organizationId: ID;
  customerId: ID;
  subscriptionId: ID;
  benefitId: ID;
  storeId: ID;
  staffId: ID;
  /** How the customer was identified / benefit presented. */
  method: RedemptionMethod;
  /** Optional staff promotional/referral code captured at the counter. */
  promoCode?: string;
  redeemedAt: ISODateString;
  status: RedemptionStatus;
}

export function createEmptyIntegrationConfiguration(
  organizationId: string,
  userId: string,
): IntegrationConfiguration {
  const now = new Date().toISOString();

  return {
    id: `integration-${Date.now()}`,
    organizationId,
    integrationName: "",
    integrationTypeId: "",
    provider: "",
    integrationStatusId: "",

    createdAt: now,
    createdBy: userId,
    updatedAt: now,
    updatedBy: userId,

    isDeleted: false,
    versionNo: 1,
  };
}
