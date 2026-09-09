import type { ID } from "@/src/core";
import type { Redemption, PerformRedemptionInput } from "@/src/core";

export interface RedemptionRepository {
  listBySubscription(subscriptionId: ID): Promise<Redemption[]>;

  create(redemption: Redemption): Promise<Redemption>;
}
