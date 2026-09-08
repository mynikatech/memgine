import type { ID, NotificationConfiguration } from "@/src/core";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { NotificationConfigurationRepository } from "./notification-configuration-repository";

/**
 * Transitional local implementation.
 *
 * Reads:
 *   local persistence only
 *
 * Writes:
 *   local persistence
 *
 * The fallback to the existing mock/domain service belongs in the
 * service layer, not in this repository.
 */
export class LocalNotificationConfigurationRepository implements NotificationConfigurationRepository {
  async getCurrent(
    organizationId: ID,
  ): Promise<NotificationConfiguration | null> {
    const key = LOCAL_DATA_KEYS.notificationConfiguration(organizationId);

    return asyncStorageStore.get<NotificationConfiguration>(key);
  }

  async save(
    organizationId: ID,
    configuration: NotificationConfiguration,
  ): Promise<NotificationConfiguration> {
    if (configuration.organizationId !== organizationId) {
      throw new Error(
        "Notification configuration organization does not match the target organization.",
      );
    }

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.notificationConfiguration(organizationId),
      configuration,
    );

    return configuration;
  }
}
