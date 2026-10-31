import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type MembershipTerms = { organizationId: string; terms: string | null };
export const membershipTermsApi = {
  get(organizationId: string): Promise<ApiResult<MembershipTerms>> {
    return httpClient.get<MembershipTerms>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/membership-terms`);
  },
  save(organizationId: string, terms: string): Promise<ApiResult<MembershipTerms>> {
    return httpClient.put<{ terms: string }, MembershipTerms>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/membership-terms`,
      { terms },
    );
  },
};
