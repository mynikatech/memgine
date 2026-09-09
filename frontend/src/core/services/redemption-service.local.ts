import type { ID } from "../domain/common";
import type { Redemption } from "../domain/entities";
import type {
  PerformRedemptionInput,
  RedemptionService,
} from "./service-contracts";
import { apis } from "@/src/data";
import { mockServices } from "../mocks/mock-services";

export class LocalRedemptionService implements RedemptionService {
  private readonly fallback = mockServices.redemption;

  async performRedemption(input: PerformRedemptionInput): Promise<Redemption> {
    const now = new Date().toISOString();
    const existing = await this.getAllKnownRedemptions();
    const redemption: Redemption = {
      id: `redemption-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      redemptionNumber: this.generateRedemptionNumber(existing),
      subscriptionId: input.subscriptionId,
      benefitId: input.benefitId,
      storeId: input.storeId,
      staffId: input.staffId,
      method: input.method,
      redemptionDateTime: now,
      quantity: input.quantity ?? 1,
      redemptionStatusId: "status-success",
      remarks: input.remarks,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
      updatedBy: input.createdBy,
      versionNo: 1,
      isDeleted: false,
    };

    const result = await apis.redemption.create(redemption);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async listBySubscription(subscriptionId: ID): Promise<Redemption[]> {
    const result = await apis.redemption.listBySubscription(subscriptionId);
    if (!result.success) throw new Error(result.error.message);

    const fallback = await this.fallback
      .listBySubscription(subscriptionId)
      .catch(() => []);
    const byId = new Map<string, Redemption>();
    for (const item of fallback) byId.set(item.id, item);
    for (const item of result.data) byId.set(item.id, item);
    return Array.from(byId.values()).filter((item) => !item.isDeleted);
  }

  private async getAllKnownRedemptions(): Promise<Redemption[]> {
    const persisted = await apis.redemption
      .listBySubscription("__ALL_SUBSCRIPTIONS__")
      .then((result) => (result.success ? result.data : []))
      .catch(() => []);
    return persisted;
  }

  private generateRedemptionNumber(existing: Redemption[]): string {
    const prefix = `RDM-${new Date().getFullYear()}`;
    const used = new Set(existing.map((item) => item.redemptionNumber));
    let sequence = 1;
    while (used.has(`${prefix}-${String(sequence).padStart(6, "0")}`))
      sequence += 1;
    return `${prefix}-${String(sequence).padStart(6, "0")}`;
  }
}
