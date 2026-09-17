import type { ID, IntegrationConfiguration } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class IntegrationConfigurationApi {
  private async fromServer(configuration: IntegrationConfiguration): Promise<IntegrationConfiguration> {
    return {
      ...configuration,
      integrationStatusId: await entityStatusApi.resolveStatusId(configuration.integrationStatusId),
    };
  }

  async list(organizationId: ID): Promise<ApiResult<IntegrationConfiguration[]>> {
    try {
      const result = await httpClient.get<IntegrationConfiguration[]>(
        `/api/v1/organizations/${organizationId}/integration-configurations`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map((item) => this.fromServer(item))));
    } catch (error) {
      return apiFailure("INTEGRATION_CONFIGURATION_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list integrations.");
    }
  }

  async save(organizationId: ID, configuration: IntegrationConfiguration,
             create: boolean): Promise<ApiResult<IntegrationConfiguration>> {
    try {
      const request = {
        id: configuration.id,
        integrationName: configuration.integrationName,
        integrationTypeId: configuration.integrationTypeId,
        provider: configuration.provider,
        integrationStatusId: await entityStatusApi.resolveEntityStatusId(
          "INTEGRATION_CONFIGURATION", configuration.integrationStatusId,
        ),
        versionNo: configuration.versionNo,
      };
      const path = `/api/v1/organizations/${organizationId}/integration-configurations`;
      const result = create
        ? await httpClient.post<typeof request, IntegrationConfiguration>(path, request)
        : await httpClient.put<typeof request, IntegrationConfiguration>(
            `${path}/${configuration.id}`, request,
          );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure("INTEGRATION_CONFIGURATION_SAVE_FAILED",
        error instanceof Error ? error.message : "Unable to save integration.");
    }
  }

  create(organizationId: ID, configuration: IntegrationConfiguration) {
    return this.save(organizationId, configuration, true);
  }

  update(organizationId: ID, configuration: IntegrationConfiguration) {
    return this.save(organizationId, configuration, false);
  }

  async delete(organizationId: ID, configurationId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<{ deleted: boolean }>(
      `/api/v1/organizations/${organizationId}/integration-configurations/${configurationId}`,
    );
    if (!result.success) return result;
    if (!result.data.deleted) return apiFailure("INTEGRATION_CONFIGURATION_DELETE_FAILED", "Integration was not deleted.");
    return apiSuccess(undefined);
  }
}
