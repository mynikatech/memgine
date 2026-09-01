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

/** Common Status Entity Object for all different Entities */
export interface Status {
  /** System-generated identifier for the status. */
  id: ID;

  /** Unique business code representing the status. */
  statusCode: string;

  /** Human-readable status name. */
  statusName: string;

  /** Explains the meaning of the status. */
  description?: string;

  /** Controls display sequence. */
  displayOrder: number;

  /** Whether the status is currently available for use. */
  isActive: boolean;
}

export interface EntityType {
  id: ID;
  entityTypeCode: string;
  entityTypeName: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface EntityStatus {
  id: ID;
  entityTypeId: ID;
  statusId: ID;
  displayOrder: number;
  isActive: boolean;
  systemManaged: boolean;
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

export interface StaffStoreAssignment {
  id: ID;
  organizationId: ID;

  staffId: ID;
  storeId: ID;

  assignmentStatusId: ID;

  effectiveDate: ISODateString;
  endDate?: ISODateString;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

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

  phoneNumber?: PhoneNumber;
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
 * Staff — organization-level staff configuration.
 *
 * Personal identity belongs to User.
 * OrganizationUser connects User to Organization.
 * Staff contains only staff-specific information.
 * ------------------------------------------------------------------ */

export interface Staff {
  id: ID;
  organizationId: ID;

  /** OrganizationUser relationship for this staff member. */
  organizationUserId: ID;

  /** System-generated business identifier. */
  staffCode: string;

  /** Staff-specific job designation. */
  designation?: string;

  /** Primary/default Store. */
  storeId?: ID;

  joiningDate: ISODateString;
  relievingDate?: ISODateString;

  /** Staff lifecycle status. */
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
/** User Entity Global */
export interface User {
  id: ID;

  /** Business-friendly user identifier. */
  userCode: string;

  /** User's given name. */
  firstName: string;

  /** Optional middle name. */
  middleName?: string;

  /** User's surname. */
  lastName: string;

  /**
   * Friendly display value.
   * Can be supplied by the user or derived by the application.
   */
  displayName?: string;

  /** Primary email address. */
  primaryEmail?: string;

  /** Primary phone number. */
  primaryPhone: PhoneNumber;

  /** Preferred language reference. */
  preferredLanguageId?: ID;

  /** Global User status. */
  userStatusId: ID;

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

  tier?: string;
  tierSequence?: number;

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

/** Product Entity */

export interface Product {
  id: ID;
  organizationId: ID;

  productCode: string;
  productName: string;
  description?: string;

  statusId: ID;

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

  productId?: ID;
  retailPrice?: Money;
  cost?: Money;

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
 * User Acquisition
 *
 * Records how a global User entered or registered on Memgine.
 * This is global identity context, not organization-owned data.
 * ------------------------------------------------------------------ */

export interface UserAcquisition {
  id: ID;

  /** Global User associated with this acquisition record. */
  userId: ID;
  /** If also Acquired via that organization */
  organizationId?: ID;

  /** Business source through which the user was acquired. */
  registrationSource: string;

  /** Channel through which the user registered or entered Memgine. */
  registrationChannel: string;

  /** Store from which the acquisition originated, when applicable. */
  sourceStoreId?: ID;

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

  /** Customer-facing subscription reference. */
  subscriptionNumber: string;

  /** The plan purchased by the subscriber. */
  subscriptionPlanId: ID;

  /** The organization-user relationship that owns this subscription. */
  organizationUserId: ID;

  /** Date on which the subscription was purchased/created. */
  subscriptionDate: string;

  /** Date on which the subscription becomes effective. */
  startDate: string;

  /** Date on which the subscription expires. */
  endDate: string;

  /** Current lifecycle status. */
  subscriptionStatusId: ID;

  /** Total subscription amount. */
  totalAmount: Money;

  createdAt: ISODateString;
  createdBy: ID;

  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Redemption — a benefit redeemed against a subscription, at a store,
 * by a staff member.
 * ------------------------------------------------------------------ */

/** How a redemption was performed at the counter. */
export enum RedemptionMethod {
  QR = "QR",
  OTP = "OTP",
  STAFF_ASSISTED = "STAFF_ASSISTED",
}

export interface Redemption {
  /** System-generated redemption identifier. */
  id: ID;

  /** Business reference number for the redemption. */
  redemptionNumber: string;

  /** Subscription against which the benefit was redeemed. */
  subscriptionId: ID;

  /** Benefit that was redeemed. */
  benefitId: ID;

  /** Store where the redemption occurred. */
  storeId: ID;

  /** Staff member who processed/approved the redemption. */
  staffId?: ID;

  /** How the redemption was performed. */
  method: RedemptionMethod;

  /** Date and time at which the redemption occurred. */
  redemptionDateTime: ISODateString;

  /** Number of benefit units redeemed. */
  quantity: number;

  /** Current redemption transaction status. */
  redemptionStatusId: ID;

  /** Optional additional notes. */
  remarks?: string;

  createdAt: ISODateString;
  createdBy: ID;

  updatedAt: ISODateString;
  updatedBy: ID;

  versionNo: number;
  isDeleted: boolean;
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

export interface RedemptionRow {
  redemption: Redemption;

  subscriptionNumber: string;
  customerName: string;

  benefitName: string;
  storeName: string;
  staffName: string;

  statusName: string;
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
