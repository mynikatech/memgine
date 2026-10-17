import type { ID } from "@/src/core";
import {
  CustomerSupportApi,
  type CreateCustomerSupportRequest,
  type CustomerSupportRequest,
  type CustomerSupportRequestDetail,
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
}
