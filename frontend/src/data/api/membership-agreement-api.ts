import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

/** Immutable acceptance record. Never reconstruct the accepted text from live terms. */
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
};

export type MembershipAgreementPreview = {
  organizationId: string;
  membershipProductId: string;
  planId: string;
  agreementText: string;
  agreementSha256: string;
  /** Opaque, short-lived server-created purchase/quote context. */
  contextToken: string;
};

/**
 * Proposed contract for the new backend endpoints. These endpoints are NOT
 * implemented by this file; do not call until routes and payment guards land.
 */
export class MembershipAgreementApi {
  preview(organizationId: string, planId: string): Promise<ApiResult<MembershipAgreementPreview>> {
    return httpClient.get(`/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/membership-agreement/preview?planId=${encodeURIComponent(planId)}`);
  }

  history(organizationId: string): Promise<ApiResult<MembershipAgreementAcceptance[]>> {
    return httpClient.get(`/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/membership-agreements`);
  }
}
