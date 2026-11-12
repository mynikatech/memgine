import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type DemoCustomer = {
  userId: string;
  displayName: string;
  primaryEmail?: string;
  primaryPhone: string;
  isDemo: boolean;
  otpDeliveryMode: "DEFAULT" | "MOCK" | "LIVE";
};

export class DemoCustomerApi {
  lookup(phone: string): Promise<ApiResult<DemoCustomer | null>> {
    return httpClient.get(`/api/v1/platform/demo-customers/lookup?phone=${encodeURIComponent(phone)}`);
  }

  setDemo(userId: string, isDemo: boolean): Promise<ApiResult<boolean>> {
    return httpClient.put(`/api/v1/platform/demo-customers/${encodeURIComponent(userId)}`, { isDemo });
  }

  provision(input: { firstName: string; lastName: string; primaryPhone: string; primaryEmail?: string }): Promise<ApiResult<DemoCustomer>> {
    return httpClient.post("/api/v1/platform/demo-customers", input);
  }
}

export const demoCustomerApi = new DemoCustomerApi();
