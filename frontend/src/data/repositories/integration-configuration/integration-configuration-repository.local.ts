import type { ID, IntegrationConfiguration } from "@/src/core";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { IntegrationConfigurationRepository } from "./integration-configuration-repository";

interface IntegrationConfigurationStorageEnvelope {
  version: 1;
  configurations: IntegrationConfiguration[];
}

export class LocalIntegrationConfigurationRepository implements IntegrationConfigurationRepository {
  async list(organizationId: ID): Promise<IntegrationConfiguration[]> {
    const key = LOCAL_DATA_KEYS.integrationConfigurations(organizationId);

    const stored =
      await asyncStorageStore.get<IntegrationConfigurationStorageEnvelope>(key);

    if (!stored) {
      return [];
    }

    return Array.isArray(stored.configurations) ? stored.configurations : [];
  }

  async save(
    organizationId: ID,
    configurations: IntegrationConfiguration[],
  ): Promise<IntegrationConfiguration[]> {
    for (const configuration of configurations) {
      if (configuration.organizationId !== organizationId) {
        throw new Error(
          "Integration configuration organization does not match the target organization.",
        );
      }
    }

    const envelope: IntegrationConfigurationStorageEnvelope = {
      version: 1,
      configurations,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.integrationConfigurations(organizationId),
      envelope,
    );

    return configurations;
  }

  async delete(organizationId: ID, configurationId: ID): Promise<void> {
    const configurations = await this.list(organizationId);

    const index = configurations.findIndex(
      (configuration) =>
        configuration.id === configurationId &&
        configuration.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Integration configuration not found.");
    }

    configurations[index] = {
      ...configurations[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: configurations[index].versionNo + 1,
    };

    await this.save(organizationId, configurations);
  }
}
