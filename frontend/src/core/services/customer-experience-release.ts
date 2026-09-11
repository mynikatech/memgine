import type {
  Benefit,
  MembershipProduct,
  Offer,
  Organization,
  OrganizationBranding,
  OrganizationDetails,
  Store,
} from "../domain/entities";
import type { ID, ISODateString } from "../domain/common";

import type { CustomerExperience } from "./customer-experience";

/**
 * Immutable organization-level customer-facing snapshot.
 *
 * This is a publication artifact, not a replacement for the individual
 * domain entities. Each source entity remains independently editable.
 */
export interface CustomerExperienceReleaseSnapshot {
  customerExperience: CustomerExperience;
  organization: Organization;
  membershipProducts: MembershipProduct[];
  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  organizationBranding?: OrganizationBranding | null;
  organizationDetails?: OrganizationDetails | null;
}

export interface CustomerExperienceRelease {
  id: ID;
  organizationId: ID;
  releaseNumber: number;
  releaseStatus: "PUBLISHED" | "ARCHIVED";
  snapshot: CustomerExperienceReleaseSnapshot;
  publishedAt: ISODateString;
  publishedBy: ID;
  createdAt: ISODateString;
  createdBy: ID;
  versionNo: number;
}

export interface CustomerExperienceReleaseService {
  getPublishedRelease(
    organizationId: ID,
  ): Promise<CustomerExperienceRelease | null>;

  createProposedSnapshot(
    customerExperience: CustomerExperience,
  ): Promise<CustomerExperienceReleaseSnapshot>;

  publishRelease(
    organizationId: ID,
    customerExperience: CustomerExperience,
    publishedBy: ID,
  ): Promise<CustomerExperienceRelease>;
}
