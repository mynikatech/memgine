import { httpClient } from "./http-client";
import type { ApiResult } from "./result";
import type { MembershipPurchaseQuote } from "./counter-api";

export type MembershipAgreementAcceptance = {
  acceptanceId: string;
  organizationId: string;
  customerUserId: string;
  membershipProductId: string;
  purchaseReference: string;
  acceptanceChannel: "CUSTOMER_WEB" | "CUSTOMER_MOBILE" | "COUNTER_CUSTOMER";
  agreementText: string;
  agreementSha256: string;
  acceptedAt: string;
  subscriptionId?: string | null;
};

export type MembershipAgreementPreview = {
  organizationId: string;
  membershipProductId: string;
  planId: string;
  agreementText: string;
  agreementSha256: string;
};

export type CounterAgreementReview = MembershipAgreementPreview & {
  purchaseQuote: MembershipPurchaseQuote;
};

export type MembershipAgreementAcceptRequest = {
  planId: string;
  idempotencyKey: string;
  agreementSha256: string;
  explicitOfferId?: string;
  acceptanceChannel: "CUSTOMER_WEB" | "CUSTOMER_MOBILE";
};

export type CounterMembershipAgreementAcceptRequest = {
  storeId: string;
  staffId: string;
  challengeId: string;
  planId: string;
  idempotencyKey: string;
  agreementSha256: string;
  explicitOfferId?: string;
  acceptanceChannel: "COUNTER_CUSTOMER";
};

const path = (organizationId: string) =>
  `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}`;

const counterPath = (organizationId: string) =>
  `/api/v1/organizations/${encodeURIComponent(organizationId)}/counter/purchases/agreement`;

export class MembershipAgreementApi {
  preview(
    organizationId: string,
    planId: string,
    explicitOfferId?: string,
  ): Promise<ApiResult<MembershipAgreementPreview>> {
    const query =
      `planId=${encodeURIComponent(planId)}` +
      (explicitOfferId
        ? `&explicitOfferId=${encodeURIComponent(explicitOfferId)}`
        : "");
    return httpClient.get(
      `${path(organizationId)}/membership-agreement/preview?${query}`,
    );
  }

  accept(
    organizationId: string,
    request: MembershipAgreementAcceptRequest,
  ): Promise<ApiResult<MembershipAgreementAcceptance>> {
    return httpClient.post(
      `${path(organizationId)}/membership-agreement/accept`,
      request,
    );
  }

  history(
    organizationId: string,
  ): Promise<ApiResult<MembershipAgreementAcceptance[]>> {
    return httpClient.get(`${path(organizationId)}/membership-agreements`);
  }

  // Counter endpoints intentionally use staff authentication and verify customer
  // identity against the Counter purchase/OTP context on the backend.
  counterPreview(
    organizationId: string,
    challengeId: string,
    explicitOfferId?: string,
  ): Promise<ApiResult<CounterAgreementReview>> {
    const params = [
      `challengeId=${encodeURIComponent(challengeId)}`,
      ...(explicitOfferId
        ? [`explicitOfferId=${encodeURIComponent(explicitOfferId)}`]
        : []),
    ];
    return httpClient.get(
      `${counterPath(organizationId)}/preview?${params.join("&")}`,
    );
  }

  counterAccept(
    organizationId: string,
    request: CounterMembershipAgreementAcceptRequest,
  ): Promise<ApiResult<MembershipAgreementAcceptance>> {
    return httpClient.post(`${counterPath(organizationId)}/accept`, request);
  }
}
