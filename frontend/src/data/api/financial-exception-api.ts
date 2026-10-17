import type { ID } from "@/src/core";

import { httpClient } from "./http-client";
import { apiFailure, type ApiResult } from "./result";

export type FinancialExceptionSummary = {
  financialExceptionId: ID;
  sourceChannel: string;
  providerCode: string;
  providerReferenceId?: string | null;
  providerTransactionId?: string | null;
  amountMinor: number;
  currencyCode: string;
  caseStatus: string;
  fulfillmentOutcome: string;
  openedAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

export type FinancialExceptionDetail = FinancialExceptionSummary & {
  paymentIntentId?: ID | null;
  commerceTransactionId?: ID | null;
  classification: string;
  evidenceReason?: string | null;
};

export type FinancialExceptionEvent = {
  eventId: ID;
  eventType: string;
  previousCaseStatus?: string | null;
  newCaseStatus?: string | null;
  previousFulfillmentOutcome?: string | null;
  newFulfillmentOutcome?: string | null;
  actorUserId?: ID | null;
  actorOrigin: string;
  description: string;
  createdAt: string;
};

export type FinancialExceptionTransitionRequest = {
  newStatus: string;
  reason: string;
};

export class FinancialExceptionApi {
  private base(organizationId: ID) {
    return `/api/v1/organizations/${encodeURIComponent(organizationId)}/financial-exceptions`;
  }

  list(organizationId: ID): Promise<ApiResult<FinancialExceptionSummary[]>> {
    return httpClient.get(this.base(organizationId));
  }

  detail(
    organizationId: ID,
    exceptionId: ID,
  ): Promise<ApiResult<FinancialExceptionDetail>> {
    return httpClient.get(
      `${this.base(organizationId)}/${encodeURIComponent(exceptionId)}`,
    );
  }

  events(
    organizationId: ID,
    exceptionId: ID,
  ): Promise<ApiResult<FinancialExceptionEvent[]>> {
    return httpClient.get(
      `${this.base(organizationId)}/${encodeURIComponent(exceptionId)}/events`,
    );
  }

  async transition(
    organizationId: ID,
    exceptionId: ID,
    request: FinancialExceptionTransitionRequest,
  ): Promise<ApiResult<boolean>> {
    try {
      return await httpClient.post(
        `${this.base(organizationId)}/${encodeURIComponent(exceptionId)}/transition`,
        request,
      );
    } catch (error) {
      return apiFailure(
        "FINANCIAL_EXCEPTION_TRANSITION_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to update the financial exception.",
      );
    }
  }

  async recover(
    organizationId: ID,
    exceptionId: ID,
    reason: string,
  ): Promise<ApiResult<string | null>> {
    try {
      return await httpClient.post(
        `${this.base(organizationId)}/${encodeURIComponent(exceptionId)}/recover`,
        { reason },
      );
    } catch (error) {
      return apiFailure(
        "FINANCIAL_EXCEPTION_RECOVERY_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to recover fulfillment.",
      );
    }
  }
}
