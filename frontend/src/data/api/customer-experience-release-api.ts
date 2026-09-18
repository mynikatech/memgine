import type {
  CustomerExperienceRelease,
  CustomerExperienceReleaseSnapshot,
} from "@/src/core/services/customer-experience-release";

import { httpClient } from "./http-client";

export type PublishCustomerExperienceReleaseRequest = {
  snapshot: CustomerExperienceReleaseSnapshot;
  publishedBy: string;
};

type PublishedCustomerExperienceReleaseResponse = {
  release: CustomerExperienceRelease | null;
};

export class CustomerExperienceReleaseApi {
  async getPublished(
    organizationId: string,
  ): Promise<CustomerExperienceRelease | null> {
    const result =
      await httpClient.get<PublishedCustomerExperienceReleaseResponse>(
        `/api/v1/organizations/${encodeURIComponent(
          organizationId,
        )}/customer-experience-release/published`,
      );

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data.release;
  }

  async publish(
    organizationId: string,
    request: PublishCustomerExperienceReleaseRequest,
  ): Promise<CustomerExperienceRelease> {
    const result = await httpClient.post<
      PublishCustomerExperienceReleaseRequest,
      CustomerExperienceRelease
    >(
      `/api/v1/organizations/${encodeURIComponent(
        organizationId,
      )}/customer-experience-release/publish`,
      request,
    );

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }
}

export const customerExperienceReleaseApi = new CustomerExperienceReleaseApi();
