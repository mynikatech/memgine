import { Platform } from "react-native";

import { httpClient } from "@/src/data/api/http-client";

export type ActivityEventType =
  | "BUY_MEMBERSHIP_CLICKED"
  | "COUNTER_SELL_MEMBERSHIP_CLICKED"
  | "COUNTER_REDEEM_CLICKED";

type ActivityContext = {
  organizationId: string;
  storeId?: string;
  staffId?: string;
  membershipProductId?: string;
  subscriptionId?: string;
};

const platform = (): "WEB" | "ANDROID" | "IOS" | "UNKNOWN" => {
  if (Platform.OS === "web") return "WEB";
  if (Platform.OS === "android") return "ANDROID";
  if (Platform.OS === "ios") return "IOS";
  return "UNKNOWN";
};

export function trackActivity(
  eventType: ActivityEventType,
  context: ActivityContext,
): void {
  void httpClient
    .post<typeof context & { eventType: ActivityEventType; platform: string }, { accepted: boolean }>(
      "/api/v1/activity-audit/events",
      { eventType, ...context, platform: platform() },
    )
    .then((result) => {
      if (!result.success) {
        console.warn("Activity tracking was not accepted:", eventType);
      }
    })
    .catch(() => {
      console.warn("Activity tracking failed:", eventType);
    });
}
