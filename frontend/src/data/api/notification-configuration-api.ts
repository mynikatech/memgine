import type { ID, NotificationConfiguration } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

type ServerResult = { configuration: NotificationConfiguration | null };

export class NotificationConfigurationApi {
  async get(organizationId: ID): Promise<ApiResult<NotificationConfiguration | null>> {
    try {
      const result = await httpClient.get<ServerResult>(
        `/api/v1/organizations/${organizationId}/notification-configuration`,
      );
      if (!result.success) return result;
      const configuration = result.data.configuration;
      if (!configuration) return apiSuccess(null);
      return apiSuccess({
        ...configuration,
        notificationStatusId: await entityStatusApi.resolveStatusId(
          configuration.notificationStatusId,
        ),
      });
    } catch (error) {
      return apiFailure("NOTIFICATION_CONFIGURATION_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load notification configuration.");
    }
  }

  async save(organizationId: ID, configuration: NotificationConfiguration): Promise<ApiResult<NotificationConfiguration>> {
    try {
      const request = {
        configurationName: configuration.configurationName,
        emailEnabled: configuration.emailEnabled,
        smsEnabled: configuration.smsEnabled,
        whatsappEnabled: configuration.whatsappEnabled,
        pushEnabled: configuration.pushEnabled,
        inAppEnabled: configuration.inAppEnabled,
        otpDeliveryChannel: configuration.otpDeliveryChannel,
        notificationStatusId: await entityStatusApi.resolveEntityStatusId(
          "NOTIFICATION_CONFIGURATION", configuration.notificationStatusId,
        ),
        versionNo: configuration.versionNo,
      };
      const result = await httpClient.put<typeof request, NotificationConfiguration>(
        `/api/v1/organizations/${organizationId}/notification-configuration`, request,
      );
      if (!result.success) return result;
      return apiSuccess({
        ...result.data,
        notificationStatusId: await entityStatusApi.resolveStatusId(result.data.notificationStatusId),
      });
    } catch (error) {
      return apiFailure("NOTIFICATION_CONFIGURATION_SAVE_FAILED",
        error instanceof Error ? error.message : "Unable to save notification configuration.");
    }
  }
}
