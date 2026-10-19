import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type ResolutionOption = {
  code: string;
  type: "ISSUE" | "ACTION" | "REFUND_REASON";
  name: string;
  description?: string | null;
  displayOrder: number;
};
export type LinkedRefund = {
  paymentRefundId: string;
  organizationId?: string;
  paymentIntentId?: string | null;
  supportRequestId?: string | null;
  financialExceptionId?: string | null;
  originalProviderCode: string;
  refundAmountMinor: number;
  currencyCode: string;
  reasonCode: string;
  approvalStatus: string;
  executionStatus: string;
  requestedAt: string;
  versionNo: number;
};
export type RefundRequest = {
  paymentIntentId?: string;
  commerceTransactionId?: string;
  amountMinor: number;
  reasonCode: string;
  explanation?: string;
  supportRequestId?: string;
  financialExceptionId?: string;
  idempotencyKey: string;
  resolutionAction?: "REFUND" | "REFUND_AND_CANCEL";
};
export type MembershipAction = {
  subscriptionId: string;
  actionStatus: "WAITING_FOR_REFUND" | "COMPLETED" | "NEEDS_REVIEW";
  lastErrorCode?: string | null;
};
export type RefundExecution = {
  paymentRefundId: string;
  executionStatus: string;
  providerRefundReference?: string | null;
  versionNo: number;
};

const base = (org: string) =>
  `/api/v1/organizations/${encodeURIComponent(org)}/payment-refunds`;
export const refundResolutionApi = {
  options(
    org: string,
    scope: "SUPPORT" | "PAYMENT",
  ): Promise<ApiResult<ResolutionOption[]>> {
    return httpClient.get(`${base(org)}/resolution-options?scope=${scope}`);
  },
  bySupport(org: string, caseId: string): Promise<ApiResult<LinkedRefund[]>> {
    return httpClient.get(
      `${base(org)}/by-support/${encodeURIComponent(caseId)}`,
    );
  },
  byException(org: string, caseId: string): Promise<ApiResult<LinkedRefund[]>> {
    return httpClient.get(
      `${base(org)}/by-financial-exception/${encodeURIComponent(caseId)}`,
    );
  },
  create(
    org: string,
    request: RefundRequest,
  ): Promise<ApiResult<LinkedRefund>> {
    return httpClient.post(base(org), request);
  },
  execution(org: string, id: string): Promise<ApiResult<RefundExecution>> {
    return httpClient.get(`${base(org)}/${encodeURIComponent(id)}/execution`);
  },
  execute(org: string, id: string): Promise<ApiResult<RefundExecution>> {
    return httpClient.post(
      `${base(org)}/${encodeURIComponent(id)}/execute`,
      {},
    );
  },
  membershipAction(
    org: string,
    id: string,
  ): Promise<ApiResult<MembershipAction | null>> {
    return httpClient.get(
      `${base(org)}/${encodeURIComponent(id)}/membership-action`,
    );
  },
  completeMembershipAction(
    org: string,
    id: string,
  ): Promise<ApiResult<MembershipAction | null>> {
    return httpClient.post(
      `${base(org)}/${encodeURIComponent(id)}/complete-membership-action`,
      {},
    );
  },
  reconcile(org: string, id: string): Promise<ApiResult<RefundExecution>> {
    return httpClient.post(
      `${base(org)}/${encodeURIComponent(id)}/reconcile`,
      {},
    );
  },
};
