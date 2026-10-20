import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type RedemptionResolutionCandidate = {
  itemId: string;
  transactionId: string;
  itemType: "BENEFIT" | "OFFER";
  itemName: string;
  subscriptionId: string;
  redemptionNumber: string;
  itemStatus: string;
  resolutionId?: string | null;
  actionStatus?: string | null;
  commerceTransactionId?: string | null;
  paymentAmountMinor?: number | null;
  currencyCode?: string | null;
};
export type RedemptionResolutionAction = "RESTORE_ONLY" | "REFUND_ONLY" | "REFUND_AND_RESTORE";
export type RedemptionResolutionResult = {
  resolutionId: string;
  actionStatus: string;
  paymentRefundId?: string | null;
};
export type RedemptionResolutionDetail = {
  actionCode: RedemptionResolutionAction;
  actionStatus: string;
  paymentRefundId?: string | null;
};
const path = (org: string) => `/api/v1/organizations/${encodeURIComponent(org)}/redemption-resolutions`;
export const redemptionResolutionApi = {
  candidates(org: string): Promise<ApiResult<RedemptionResolutionCandidate[]>> {
    return httpClient.get(path(org));
  },
  create(org: string, request: {
    redemptionTransactionItemId: string;
    action: RedemptionResolutionAction;
    reasonCode: string;
    explanation: string;
    idempotencyKey: string;
  }): Promise<ApiResult<RedemptionResolutionResult>> {
    return httpClient.post(path(org), request);
  },
  detail(org: string, id: string): Promise<ApiResult<RedemptionResolutionDetail>> {
    return httpClient.get(`${path(org)}/${encodeURIComponent(id)}`);
  },
  complete(org: string, id: string): Promise<ApiResult<string>> {
    return httpClient.post(`${path(org)}/${encodeURIComponent(id)}/complete`, {});
  },
};
