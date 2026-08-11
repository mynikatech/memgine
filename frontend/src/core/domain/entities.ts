import { Capability, StaffRole } from "../permissions/permissions";

import { Address, BillingInterval, ID, ISODateString, Money, TemplateCategory } from "./common";

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
  legalName: string;
  displayName: string;
  category: TemplateCategory;
  createdAt: ISODateString;
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
  name: string;
  address: Address;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  isActive: boolean;
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
  storeId?: ID;
  fullName: string;
  role: StaffRole;
  capabilities: Capability[];
  isActive: boolean;
}

/* ------------------------------------------------------------------ *
 * MembershipProduct — the product a business SELLS (NOT the customer's
 * subscription). Do not collapse with Subscription.
 * ------------------------------------------------------------------ */

export interface SubscriptionPlan {
  id: ID;
  name: string;
  price: Money;
  billingInterval: BillingInterval;
}

export interface MembershipProduct {
  id: ID;
  organizationId: ID;
  name: string;
  description?: string;
  /** Business-defined tier label, e.g. "Gold". */
  tier?: string;
  benefitIds: ID[];
  plans: SubscriptionPlan[];
  isPublished: boolean;
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
  title: string;
  description?: string;
  type: BenefitType;
  validity?: BenefitValidity;
}

/* ------------------------------------------------------------------ *
 * Offer — promotional, may target membership products.
 * ------------------------------------------------------------------ */

export interface Offer {
  id: ID;
  organizationId: ID;
  title: string;
  description?: string;
  badge?: string;
  validity?: BenefitValidity;
  targetProductIds?: ID[];
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
}

/* ------------------------------------------------------------------ *
 * Redemption — a benefit redeemed against a subscription, at a store,
 * by a staff member.
 * ------------------------------------------------------------------ */

export enum RedemptionStatus {
  COMPLETED = "COMPLETED",
  VOID = "VOID",
}

export interface Redemption {
  id: ID;
  organizationId: ID;
  subscriptionId: ID;
  benefitId: ID;
  storeId: ID;
  staffId: ID;
  redeemedAt: ISODateString;
  status: RedemptionStatus;
}
