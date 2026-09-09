import type { ID, IntegrationConfiguration } from "@/src/core";

export interface IntegrationConfigurationRepository {
  list(organizationId: ID): Promise<IntegrationConfiguration[]>;

  save(
    organizationId: ID,
    configurations: IntegrationConfiguration[],
  ): Promise<IntegrationConfiguration[]>;

  delete(organizationId: ID, configurationId: ID): Promise<void>;
}
