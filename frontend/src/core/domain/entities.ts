import { Capability, StaffRole } from "../permissions/permissions";

import {
  Address,
  PhoneNumber,
  BillingInterval,
  ID,
  ISODateString,
  Money,
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
  displayName?: string;

  organizationTypeId: ID;
  organizationStatusId: ID;

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

/** The business branding information. */
export interface OrganizationBranding {
  id: ID;
  organizationId: ID;

  brandingName: string;
  themeTemplateId: ID;

  logoUrl?: string;
  darkThemeLogoUrl?: string;
  faviconUrl?: string;
  splashScreenImageUrl?: string;

  /** Optional customer-facing tagline configured by the organization. */
  tagline?: string;

  /** Optional customer-facing hero image configured by the organization. */
  heroImageUrl?: string;

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

/* ------------------------------------------------------------------ *
 * Template
 * ------------------------------------------------------------------ */

/**
 * Persisted Template entity.
 *
 * A Template belongs to the platform/template catalogue or to an
 * organization-owned copied configuration, depending on isDefault.
 *
 * Organization Type determines which type of organization the template
 * applies to. Template Type determines what kind of template it is,
 * for example THEME_LAYOUT or DATA_CONTENT.
 */
export interface Template {
  id: ID;

  templateTypeId: ID;

  templateName: string;

  organizationTypeId: ID;

  templateDescription?: string;

  templateFormat: string;

  templateDefinition: unknown;

  templateVersion: number;

  templateStatusId: ID;

  isDefault: boolean;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/**
 * Template Type classifies the kind of template stored by Memgine.
 */
export interface TemplateType {
  id: ID;

  templateTypeCode: string;

  templateTypeName: string;

  templateTypeDescription?: string;

  statusId: ID;
}

/* ------------------------------------------------------------------ *
 * Staff ↔ Store
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Organization configuration
 * ------------------------------------------------------------------ */

/** The business notification configuration. */
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

/** The business configuration to connect with external entities. */
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

/** The business integration configuration type. */
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
 * Customer — platform-level identity.
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

/* ------------------------------------------------------------------ *
 * User
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Organization User
 * ------------------------------------------------------------------ */

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
 * Membership Product
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

export interface MembershipProductBenefit {
  id: ID;
  membershipProductId: ID;
  benefitId: ID;
  displaySequence: number;
  mandatoryBenefit: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  statusId: ID;
  createdAt: ISODateString;
  createdBy: ID;
  updatedAt?: ISODateString;
  updatedBy?: ID;
  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * Product
 * ------------------------------------------------------------------ */

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
 * Offer
 * ------------------------------------------------------------------ */

export enum OfferCtaType {
  REDEEM_OFFER = "REDEEM_OFFER",
  SHOP = "SHOP",
}

export interface Offer {
  id: ID;
  organizationId: ID;

  offerCode: string;
  offerName: string;
  description?: string;

  promotionImageUrl: string;
  badgeText?: string;
  availabilityText?: string;

  membershipProductId?: ID;
  storeId?: ID;

  discountPercentage?: number;

  effectiveDate: string;
  expiryDate?: string;

  ctaLabel: string;
  ctaType: OfferCtaType;
  ctaTarget?: string;

  statusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/**
 * Extensible customer preference definition.
 *
 * Preference Type is reference/configuration data. It defines how a
 * Customer Preference value should be interpreted.
 */
export interface PreferenceType {
  id: ID;
  preferenceTypeCode: string;
  preferenceTypeName: string;
  dataType: PreferenceDataType;
  defaultValue?: string;
  description?: string;
  preferenceTypeStatusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

export type PreferenceDataType =
  | "BOOLEAN"
  | "TEXT"
  | "INTEGER"
  | "DECIMAL"
  | "IDENTIFIER"
  | "DATE"
  | "DATETIME";

/**
 * A single preference value belonging to a global User.
 *
 * Uniqueness rule:
 * (userId, preferenceTypeId) must be unique for active records.
 */
export interface CustomerPreference {
  id: ID;
  userId: ID;
  preferenceTypeId: ID;
  preferenceValue: string;
  preferenceStatusId: ID;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

/* Organization-owned referral configuration. */
export interface ReferralProgram {
  id: ID;
  organizationId: ID;
  referralProgramCode: string;
  referralProgramName: string;
  description?: string;
  referrerRewardTypeId?: ID;
  referrerRewardValue?: number;
  refereeRewardTypeId?: ID;
  refereeRewardValue?: number;
  effectiveDate: ISODateString;
  expiryDate?: ISODateString;
  referralProgramStatusId: ID;
  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;
  isDeleted: boolean;
  versionNo: number;
}

/* A concrete referral generated by a customer. */
export interface Referral {
  id: ID;
  organizationId: ID;
  referralProgramId: ID;
  referrerUserId: ID;
  referralCode: string;
  referredUserId?: ID;
  referredEmail?: string;
  referredPhone?: PhoneNumber;
  referralStatusId: ID;
  createdAt: ISODateString;
  acceptedAt?: ISODateString;
  convertedAt?: ISODateString;
  rewardIssuedAt?: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;
  isDeleted: boolean;
  versionNo: number;
}

export interface PaymentConfirmation {
  id: ID;
  subscriptionId: ID;
  externalTransactionReference: string;
  paymentAmount: Money;
  currencyId: ID;
  paymentDate: ISODateString;
  paymentStatusId: ID;
  processed: boolean;
  processedAt?: ISODateString;
  processingRemarks?: string;
  createdAt: ISODateString;
  createdBy: ID;
  updatedAt?: ISODateString;
  updatedBy?: ID;
  isDeleted: boolean;
  versionNo: number;
}

/* ------------------------------------------------------------------ *
 * User Acquisition
 * ------------------------------------------------------------------ */

export interface UserAcquisition {
  id: ID;

  /** Global User associated with this acquisition record. */
  userId: ID;

  /** If also acquired via that organization. */
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
 * Subscription
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
 * Redemption
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
