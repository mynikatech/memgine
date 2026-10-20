import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type SupportNotificationSettings = {
  whatsappEnabled: boolean;
  whatsappConsentGranted: boolean;
  emailEnabled: boolean;
  emailAvailable: boolean;
};
export type UpdateSupportNotificationSettings = {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  whatsappConsent?: boolean;
};
const path = "/api/v1/customer/support-notification-settings";
export const supportNotificationSettingsApi = {
  get(): Promise<ApiResult<SupportNotificationSettings>> { return httpClient.get(path); },
  update(value: UpdateSupportNotificationSettings): Promise<ApiResult<SupportNotificationSettings>> {
    return httpClient.put(path,value);
  },
};
