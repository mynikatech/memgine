import type { ID } from "../domain/common";
import {
  OrgAdminRedemptionApi,
  OrgAdminSubscriptionApi,
  type OrgAdminRedemption,
  type OrgAdminSubscription,
} from "@/src/data/api/org-admin-transaction-api";

export class OrgAdminTransactionReadService {
  constructor(
    private readonly subscriptions: OrgAdminSubscriptionApi,
    private readonly redemptions: OrgAdminRedemptionApi,
  ) {}

  async listSubscriptions(organizationId: ID): Promise<OrgAdminSubscription[]> {
    const result = await this.subscriptions.list(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async listRedemptions(organizationId: ID): Promise<OrgAdminRedemption[]> {
    const result = await this.redemptions.list(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
}
