import type { ID, NotificationConfiguration } from "@/src/core";

export interface NotificationConfigurationRepository {
  getCurrent(organizationId: ID): Promise<NotificationConfiguration | null>;

  save(
    organizationId: ID,
    configuration: NotificationConfiguration,
  ): Promise<NotificationConfiguration>;
}
