import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type InvestigatedPayment = {
  paymentIntentId: string;
  customerUserId: string | null;
  customerName: string | null;
  paymentStatus: string;
  providerCode: string;
  providerReference: string | null;
  amountMinor: number;
  currencyCode: string;
  createdAt: string;
  storeId: string | null;
  staffId: string | null;
  authorizationMode: string | null;
  subscriptionId: string | null;
  membershipPlanId: string | null;
  attemptCount: number;
  latestAttemptStatus: string | null;
  refundedMinor: number;
  reservedRefundMinor: number;
  financialExceptionId: string | null;
};

const route = (organizationId: string) =>
  `/api/v1/organizations/${encodeURIComponent(organizationId)}/transaction-investigation`;

export const transactionInvestigationApi = {
  payments(organizationId: string): Promise<ApiResult<InvestigatedPayment[]>> {
    return httpClient.get(`${route(organizationId)}/payments`);
  },
  supportPayments(organizationId: string, supportRequestId: string): Promise<ApiResult<InvestigatedPayment[]>> {
    return httpClient.get(`${route(organizationId)}/support/${encodeURIComponent(supportRequestId)}/payments`);
  },
};
