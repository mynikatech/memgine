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
export type OrganizationSupportRequest = CustomerSupportRequest & {
  customerUserId: ID;
  assignedToUserId?: ID | null;
  versionNo: number;
};

export type CustomerSupportMessage = {
  supportMessageId: ID;
  supportRequestId: ID;
  authorUserId: ID;
  authorRole: string;
  authorName?: string | null;
  messageType: string;
  messageBody: string;
  isInternal: boolean;
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
export type SupportRequestFeedback = {
  feedbackId: ID;
  supportRequestId: ID;
  rating?: string | null;
  feedbackComment?: string | null;
  submittedAt: string;
};

export type CustomerSupportRequestDetail = {
  request: CustomerSupportRequest;
  messages: CustomerSupportMessage[];
  events: CustomerSupportEvent[];
  feedback?: SupportRequestFeedback | null;
};
export type OrganizationSupportRequestDetail = {
  request: OrganizationSupportRequest;
  messages: CustomerSupportMessage[];
  events: CustomerSupportEvent[];
  feedback?: SupportRequestFeedback | null;
};
export type UpdateOrganizationSupportRequest = {
  status?: string;
  priority?: string;
  assignedToUserId?: ID;
  resolutionSummary?: string;
  versionNo: number;
};
export type PaymentInvestigation = {
  investigationId: ID;
  supportRequestId: ID;
  financialExceptionId?: ID | null;
  source: string;
  state: string;
  escalationReason: string;
  paymentReference?: string | null;
  investigationDescription?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type PaymentExceptionCandidate = {
  financialExceptionId: ID;
  paymentIntentId?: ID | null;
  commerceTransactionId?: ID | null;
  providerReferenceId?: string | null;
  amountMinor: number;
  currencyCode: string;
  caseStatus: string;
  fulfillmentOutcome: string;
  openedAt: string;
};
export type EscalatePaymentInvestigation = {
  reason: string;
  paymentReference?: string;
  description?: string;
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

  addMessage(
    id: ID,
    messageBody: string,
  ): Promise<ApiResult<{ created: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/messages`, {
      messageBody,
    });
  }

  reopen(id: ID, reason: string): Promise<ApiResult<{ updated: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/reopen`, {
      reason,
    });
  }

  close(id: ID): Promise<ApiResult<{ updated: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/close`, {});
  }

  submitFeedback(
    id: ID,
    feedback: { rating?: string; comment?: string },
  ): Promise<ApiResult<{ submitted: boolean }>> {
    return httpClient.post(`${this.base}/${encodeURIComponent(id)}/feedback`, feedback);
  }

  organizationList(
    organizationId: ID,
    filters: {
      category?: string;
      status?: string;
      priority?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ApiResult<OrganizationSupportRequest[]>> {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.size ? `?${query.toString()}` : "";
    return httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests${suffix}`,
    );
  }

  organizationDetail(
    organizationId: ID,
    requestId: ID,
  ): Promise<ApiResult<OrganizationSupportRequestDetail>> {
    return httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}`,
    );
  }

  organizationMessage(
    organizationId: ID,
    requestId: ID,
    messageBody: string,
    internal = false,
  ): Promise<ApiResult<{ created: boolean }>> {
    const action = internal ? "internal-notes" : "messages";
    return httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}/${action}`,
      { messageBody },
    );
  }

  updateOrganization(
    organizationId: ID,
    requestId: ID,
    request: UpdateOrganizationSupportRequest,
  ): Promise<ApiResult<{ updated: boolean }>> {
    return httpClient.patch(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}`,
      request,
    );
  }

  paymentInvestigation(
    organizationId: ID,
    requestId: ID,
  ): Promise<ApiResult<PaymentInvestigation | null>> {
    return httpClient.get<PaymentInvestigation | null>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}/payment-investigation`,
      true,
    );
  }
  paymentExceptionCandidates(
    organizationId: ID,
    requestId: ID,
  ): Promise<ApiResult<PaymentExceptionCandidate[]>> {
    return httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}/payment-exception-candidates`,
    );
  }
  escalatePaymentInvestigation(
    organizationId: ID,
    requestId: ID,
    request: EscalatePaymentInvestigation,
  ): Promise<ApiResult<{ investigationId: ID }>> {
    return httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}/payment-investigation`,
      request,
    );
  }
  linkPaymentException(
    organizationId: ID,
    requestId: ID,
    financialExceptionId: ID,
  ): Promise<ApiResult<{ investigationId: ID }>> {
    return httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/support-requests/${encodeURIComponent(requestId)}/payment-exception-link`,
      { financialExceptionId },
    );
  }

  platformList(
    filters: {
      organizationId?: ID;
      category?: string;
      status?: string;
      priority?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ApiResult<OrganizationSupportRequest[]>> {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.size ? `?${query.toString()}` : "";
    return httpClient.get(`/api/v1/platform/support-requests${suffix}`);
  }

  platformDetail(requestId: ID): Promise<ApiResult<OrganizationSupportRequestDetail>> {
    return httpClient.get(`/api/v1/platform/support-requests/${encodeURIComponent(requestId)}`);
  }

  platformMessage(
    requestId: ID,
    messageBody: string,
    kind: "note" | "recommendation" | "reply",
  ): Promise<ApiResult<{ created: boolean }>> {
    const action = kind === "note" ? "notes" : kind === "recommendation" ? "recommendations" : "replies";
    return httpClient.post(
      `/api/v1/platform/support-requests/${encodeURIComponent(requestId)}/${action}`,
      { messageBody },
    );
  }
}
