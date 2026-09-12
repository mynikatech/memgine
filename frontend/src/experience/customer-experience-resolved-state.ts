import type { CustomerExperienceReleaseSnapshot } from "@/src/core";
import type { PreviewDomainData } from "./customer-experience-preview-data";

/**
 * Runtime/application model used to keep the resolved Current and Proposed
 * states explicit. This is not a physical database entity.
 */
export interface CustomerExperienceResolvedState {
  snapshot: CustomerExperienceReleaseSnapshot;
  domainData: PreviewDomainData;
}

export function createCustomerExperienceResolvedState(
  snapshot: CustomerExperienceReleaseSnapshot,
  domainData: PreviewDomainData,
): CustomerExperienceResolvedState {
  return { snapshot, domainData };
}
