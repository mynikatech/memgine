import type { ID } from "@/src/core";
import {
  CustomerSupportApi,
  type CreateCustomerSupportRequest,
  type CustomerSupportRequest,
  type CustomerSupportRequestDetail,
  type OrganizationSupportRequest,
  type OrganizationSupportRequestDetail,
  type UpdateOrganizationSupportRequest,
  type PaymentInvestigation,
  type PaymentExceptionCandidate,
  type EscalatePaymentInvestigation,
  type CounterSupportContext,
} from "@/src/data/api/customer-support-api";

export class CustomerSupportService {
  constructor(private readonly api = new CustomerSupportApi()) {}

  private unwrap<T>(result: { success: boolean; data?: T; error?: { message: string } }): T {
    if (!result.success) throw new Error(result.error?.message ?? "Support is unavailable.");
    return result.data as T;
  }

  async list(limit = 50, offset = 0): Promise<CustomerSupportRequest[]> {
    return this.unwrap(await this.api.list(limit, offset));
  }

  async create(request: CreateCustomerSupportRequest): Promise<{ supportRequestId: ID; ticketNumber: string }> {
    return this.unwrap(await this.api.create(request));
  }

  async detail(id: ID): Promise<CustomerSupportRequestDetail> {
    return this.unwrap(await this.api.detail(id));
  }

  async addMessage(id: ID, messageBody: string): Promise<void> {
    this.unwrap(await this.api.addMessage(id, messageBody));
  }

  async reopen(id: ID, reason: string): Promise<void> {
    this.unwrap(await this.api.reopen(id, reason));
  }

  async close(id: ID): Promise<void> {
    this.unwrap(await this.api.close(id));
  }

  async submitFeedback(
    id: ID,
    feedback: { rating?: string; comment?: string },
  ): Promise<void> {
    this.unwrap(await this.api.submitFeedback(id, feedback));
  }

  async organizationList(organizationId: ID, filters: { category?: string; status?: string; priority?: string; limit?: number; offset?: number } = {}): Promise<OrganizationSupportRequest[]> {
    return this.unwrap(await this.api.organizationList(organizationId, filters));
  }

  async organizationDetail(organizationId: ID, requestId: ID): Promise<OrganizationSupportRequestDetail> {
    return this.unwrap(await this.api.organizationDetail(organizationId, requestId));
  }

  async organizationMessage(organizationId: ID, requestId: ID, message: string, internal = false): Promise<void> {
    this.unwrap(await this.api.organizationMessage(organizationId, requestId, message, internal));
  }

  async updateOrganization(organizationId: ID, requestId: ID, request: UpdateOrganizationSupportRequest): Promise<void> {
    this.unwrap(await this.api.updateOrganization(organizationId, requestId, request));
  }
  async counterList(organizationId: ID, context: CounterSupportContext): Promise<OrganizationSupportRequest[]> { return this.unwrap(await this.api.counterList(organizationId, context)); }
  async counterDetail(organizationId: ID, context: CounterSupportContext, requestId: ID): Promise<OrganizationSupportRequestDetail> { return this.unwrap(await this.api.counterDetail(organizationId, context, requestId)); }
  async counterMessage(organizationId: ID, context: CounterSupportContext, requestId: ID, message: string, internal = false): Promise<void> { this.unwrap(await this.api.counterMessage(organizationId, context, requestId, message, internal)); }
  async counterTransition(organizationId: ID, context: CounterSupportContext, requestId: ID, request: UpdateOrganizationSupportRequest, action: "resolve" | "close"): Promise<void> { this.unwrap(await this.api.counterTransition(organizationId, context, requestId, request, action)); }
  async paymentInvestigation(organizationId: ID, requestId: ID): Promise<PaymentInvestigation | null> { return this.unwrap(await this.api.paymentInvestigation(organizationId, requestId)); }
  async paymentExceptionCandidates(organizationId: ID, requestId: ID): Promise<PaymentExceptionCandidate[]> { return this.unwrap(await this.api.paymentExceptionCandidates(organizationId, requestId)); }
  async escalatePaymentInvestigation(organizationId: ID, requestId: ID, request: EscalatePaymentInvestigation): Promise<ID> { return this.unwrap(await this.api.escalatePaymentInvestigation(organizationId, requestId, request)).investigationId; }
  async linkPaymentException(organizationId: ID, requestId: ID, financialExceptionId: ID): Promise<ID> { return this.unwrap(await this.api.linkPaymentException(organizationId, requestId, financialExceptionId)).investigationId; }
  async platformList(filters: { organizationId?: ID; category?: string; status?: string; priority?: string; destination?: "BUSINESS" | "PLATFORM"; limit?: number; offset?: number } = {}): Promise<OrganizationSupportRequest[]> {
    return this.unwrap(await this.api.platformList(filters));
  }
  async platformDetail(requestId: ID): Promise<OrganizationSupportRequestDetail> {
    return this.unwrap(await this.api.platformDetail(requestId));
  }
  async updatePlatform(requestId: ID, request: UpdateOrganizationSupportRequest): Promise<void> {
    this.unwrap(await this.api.updatePlatform(requestId, request));
  }
  async platformMessage(requestId: ID, message: string, kind: "note" | "recommendation" | "reply"): Promise<void> {
    this.unwrap(await this.api.platformMessage(requestId, message, kind));
  }
}
