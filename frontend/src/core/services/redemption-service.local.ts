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
    const uniqueSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();

    const redemption: Redemption = {
      id: `redemption-${Date.now()}-${uniqueSuffix.toLowerCase()}`,
      redemptionNumber: `RDM-${new Date().getFullYear()}-${Date.now()}-${uniqueSuffix}`,
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

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async listBySubscription(subscriptionId: ID): Promise<Redemption[]> {
    const result = await apis.redemption.listBySubscription(subscriptionId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const fallback = await this.fallback
      .listBySubscription(subscriptionId)
      .catch(() => []);

    const byId = new Map<string, Redemption>();

    for (const item of fallback) {
      byId.set(item.id, item);
    }

    for (const item of result.data) {
      byId.set(item.id, item);
    }

    return Array.from(byId.values()).filter((item) => !item.isDeleted);
  }
}
