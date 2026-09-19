import type { Benefit, BenefitUsageRule, ID, MembershipProduct, Offer, Store } from "@/src/core";
import { CustomerDataApi } from "@/src/data/api/customer-data-api";
import type { CounterPurchaseResult, CounterSubscription } from "@/src/data/api/counter-api";
import type { OrgAdminRedemption } from "@/src/data/api/org-admin-transaction-api";

export type CustomerChoice = { userId: ID; displayName: string };
export type CustomerProfile = {
  organizationUserId: ID; organizationId: ID; organizationName: string;
  userId: ID; userCode: string; firstName: string; middleName?: string | null;
  lastName?: string | null; displayName?: string | null;
  primaryEmail?: string | null; primaryPhone: string;
  userStatusId: ID; userStatusName: string;
  organizationUserTypeId: ID; organizationUserStatusId: ID;
  relationshipStatusName: string; joiningDate: string;
  subscriptionCount: number; membershipName?: string | null;
};

/** Customer-facing data only. Server errors always reach the screen. */
export class CustomerDataService {
  constructor(private readonly api: CustomerDataApi) {}

  async choices(): Promise<CustomerChoice[]> {
    const result = await this.api.choices();
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async profiles(userId?: ID): Promise<CustomerProfile[]> {
    const result = await this.api.profiles(userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async subscriptions(organizationId: ID, userId: ID): Promise<CounterSubscription[]> {
    const result = await this.api.subscriptions(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async redemptions(organizationId: ID, userId: ID): Promise<OrgAdminRedemption[]> {
    const result = await this.api.redemptions(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async membershipProducts(organizationId: ID, userId?: ID): Promise<MembershipProduct[]> {
    const result = await this.api.membershipProducts(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async benefits(organizationId: ID, userId?: ID): Promise<Benefit[]> {
    const result = await this.api.benefits(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  benefitRules(organizationId: ID, userId: ID, benefitId: ID): Promise<BenefitUsageRule[]> {
    return this.api.benefitRules(organizationId, userId, benefitId);
  }

  async offers(organizationId: ID, userId: ID): Promise<Offer[]> {
    const result = await this.api.offers(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async stores(organizationId: ID, userId: ID): Promise<Store[]> {
    const result = await this.api.stores(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async purchase(organizationId: ID, input: {
    planId: ID; customerUserId?: ID; firstName?: string; lastName?: string;
    primaryEmail?: string; primaryPhone?: string;
  }): Promise<CounterPurchaseResult> {
    const result = await this.api.purchase(organizationId, input);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async preference(organizationId: ID, userId: ID, code: string): Promise<string | null> {
    const result = await this.api.preference(organizationId, userId, code);
    if (!result.success) throw new Error(result.error.message);
    return result.data.value;
  }

  async setPreference(organizationId: ID, userId: ID, code: string, value: string): Promise<string> {
    const result = await this.api.setPreference(organizationId, userId, code, value);
    if (!result.success) throw new Error(result.error.message);
    return result.data.value;
  }
}
