/**
 * Conceptual domain model for the frontend (business concepts, NOT physical DB
 * tables). Mirrors the Logical Architecture: Organization owns Membership
 * Products; products include Benefits and define Subscription Plans; Customers
 * enrol through Subscriptions; Campaigns publish Offers. See ARCHITECTURE.md.
 */
import type { BusinessConfiguration } from "@/src/business/types";

export type ID = string;

export interface Organization {
  id: ID;
  name: string;
  industry: string;
}

export interface Benefit {
  id: ID;
  organizationId: ID;
  title: string;
  description: string;
  validUntil?: string;
}

export interface SubscriptionPlan {
  id: ID;
  name: string;
  price: number;
  interval: "month" | "year";
  benefitIds: ID[];
}

export interface MembershipProduct {
  id: ID;
  organizationId: ID;
  name: string;
  tier: string;
  description: string;
  plans: SubscriptionPlan[];
  benefitIds: ID[];
}

export interface Offer {
  id: ID;
  organizationId: ID;
  title: string;
  description: string;
  badge?: string;
  validUntil?: string;
}

export interface Membership {
  id: ID;
  organizationId: ID;
  organizationName: string;
  productName: string;
  tier: string;
  status: "Active" | "Expired";
  validUntil: string;
}

export interface Store {
  id: ID;
  organizationId: ID;
  name: string;
  address: string;
}

export interface BusinessSummary {
  id: ID;
  organizationId: ID;
  name: string;
  industry: string;
  templateId: string;
}

/**
 * The single typed boundary between the frontend and any backend. The app only
 * ever talks to this interface; today it is fulfilled by a mock, later by a
 * REST/API client — with no UI changes.
 */
export interface MemgineService {
  getBusinesses(): Promise<BusinessSummary[]>;
  getBusinessConfiguration(id: ID): Promise<BusinessConfiguration>;
  getMyMemberships(): Promise<Membership[]>;
  getOffers(organizationId: ID): Promise<Offer[]>;
  getBenefits(organizationId: ID): Promise<Benefit[]>;
  getMembershipProducts(organizationId: ID): Promise<MembershipProduct[]>;
}
