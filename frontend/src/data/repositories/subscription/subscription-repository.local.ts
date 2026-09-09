import type { ID, Subscription } from "@/src/core";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { SubscriptionRepository } from "./subscription-repository";

export class LocalSubscriptionRepository implements SubscriptionRepository {
  async list(): Promise<Subscription[]> {
    const existing = await asyncStorageStore.get<Subscription[]>(
      LOCAL_DATA_KEYS.subscriptions(),
    );

    return existing ?? [];
  }

  async get(subscriptionId: ID): Promise<Subscription | null> {
    const subscriptions = await this.list();

    return (
      subscriptions.find(
        (subscription) =>
          subscription.id === subscriptionId && !subscription.isDeleted,
      ) ?? null
    );
  }

  async create(subscription: Subscription): Promise<Subscription> {
    const subscriptions = await this.list();

    const duplicateId = subscriptions.some(
      (item) => item.id === subscription.id,
    );

    if (duplicateId) {
      throw new Error(`Subscription '${subscription.id}' already exists.`);
    }

    const duplicateNumber = subscriptions.some(
      (item) =>
        !item.isDeleted &&
        item.subscriptionNumber.trim().toLowerCase() ===
          subscription.subscriptionNumber.trim().toLowerCase(),
    );

    if (duplicateNumber) {
      throw new Error(
        `Subscription number '${subscription.subscriptionNumber}' already exists.`,
      );
    }

    const updated = [...subscriptions, subscription];

    await asyncStorageStore.set(LOCAL_DATA_KEYS.subscriptions(), updated);

    return subscription;
  }
}
