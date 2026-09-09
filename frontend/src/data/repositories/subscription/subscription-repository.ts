import type { ID, Subscription } from "@/src/core";

export interface SubscriptionRepository {
  list(): Promise<Subscription[]>;

  get(subscriptionId: ID): Promise<Subscription | null>;

  create(subscription: Subscription): Promise<Subscription>;
}
