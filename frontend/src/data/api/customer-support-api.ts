import type { ID } from "@/src/core";

import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type CustomerSupportRequest = {
  supportRequestId: ID;
  organizationId: ID;
  ticketNumber: string;
  category: string;
  issueType: string;
  subject: string;
  description: string;
  source: string;
  status: string;
  priority: string;
  resolutionSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
};

export type CustomerSupportMessage = {
  supportMessageId: ID;
  supportRequestId: ID;
  authorRole: string;
  messageType: string;
  messageBody: string;
  createdAt: string;
};

export type CustomerSupportEvent = {
  eventId: ID;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorRole: string;
  description: string;
  createdAt: string;
};

export type CustomerSupportRequestDetail = {
  request: CustomerSupportRequest;
  messages: CustomerSupportMessage[];
  events: CustomerSupportEvent[];
};

export type CreateCustomerSupportRequest = {
  organizationId: ID;
  category: string;
  issueType: string;
  subject: string;
  description: string;
};

export class CustomerSupportApi {
  private readonly base = "/api/v1/customer/support-requests";

  list(limit = 50, offset = 0): Promise<ApiResult<CustomerSupportRequest[]>> {
    return httpClient.get(`${this.base}?limit=${limit}&offset=${offset}`);
  }

  create(
    request: CreateCustomerSupportRequest,
  ): Promise<ApiResult<{ supportRequestId: ID; ticketNumber: string }>> {
    return httpClient.post(this.base, request);
  }

  detail(id: ID): Promise<ApiResult<CustomerSupportRequestDetail>> {
    return httpClient.get(`${this.base}/${encodeURIComponent(id)}`);
  }

  addMessage(id: ID, messageBody: string): Promise<ApiResult<{ created: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/messages`, {
      messageBody,
    });
  }

  reopen(id: ID, reason: string): Promise<ApiResult<{ updated: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/reopen`, {
      reason,
    });
  }
}
