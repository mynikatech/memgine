import type { ID } from "../domain/common";
import type {
  FinancialExceptionDetail,
  FinancialExceptionEvent,
  FinancialExceptionSummary,
  FinancialExceptionTransitionRequest,
} from "@/src/data/api/financial-exception-api";
import { FinancialExceptionApi } from "@/src/data/api/financial-exception-api";

export class FinancialExceptionService {
  constructor(private readonly api: FinancialExceptionApi) {}

  async list(organizationId: ID): Promise<FinancialExceptionSummary[]> {
    const result = await this.api.list(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async detail(
    organizationId: ID,
    exceptionId: ID,
  ): Promise<FinancialExceptionDetail> {
    const result = await this.api.detail(organizationId, exceptionId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async events(
    organizationId: ID,
    exceptionId: ID,
  ): Promise<FinancialExceptionEvent[]> {
    const result = await this.api.events(organizationId, exceptionId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async transition(
    organizationId: ID,
    exceptionId: ID,
    request: FinancialExceptionTransitionRequest,
  ): Promise<void> {
    const result = await this.api.transition(
      organizationId,
      exceptionId,
      request,
    );
    if (!result.success) throw new Error(result.error.message);
  }

  async recover(
    organizationId: ID,
    exceptionId: ID,
    reason: string,
  ): Promise<string | null> {
    const result = await this.api.recover(organizationId, exceptionId, reason);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
}
