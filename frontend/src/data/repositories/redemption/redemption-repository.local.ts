import type { ID } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { Redemption } from "@/src/core";
import type { RedemptionRepository } from "./redemption-repository";

export class LocalRedemptionRepository implements RedemptionRepository {
  private async listAll(): Promise<Redemption[]> {
    return (
      (await asyncStorageStore.get<Redemption[]>(
        LOCAL_DATA_KEYS.redemptions(),
      )) ?? []
    );
  }

  async listBySubscription(subscriptionId: ID): Promise<Redemption[]> {
    const redemptions = await this.listAll();
    return redemptions.filter(
      (redemption) =>
        redemption.subscriptionId === subscriptionId && !redemption.isDeleted,
    );
  }

  async create(redemption: Redemption): Promise<Redemption> {
    const redemptions = await this.listAll();

    if (redemptions.some((item) => item.id === redemption.id)) {
      throw new Error(`Redemption already exists: ${redemption.id}`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.redemptions(), [
      ...redemptions,
      redemption,
    ]);

    return redemption;
  }
}
