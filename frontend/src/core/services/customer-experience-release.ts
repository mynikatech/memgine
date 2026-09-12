import type {
  Benefit,
  BenefitUsageRule,
  MembershipProduct,
  Offer,
  OfferUsageRule,
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
 * Usage rules are included because the production renderer resolves them
 * independently from Benefit/Offer records.
 */
export interface CustomerExperienceReleaseSnapshot {
  customerExperience: CustomerExperience;
  organization: Organization;
  membershipProducts: MembershipProduct[];
  benefits: Benefit[];
  benefitUsageRules: BenefitUsageRule[];
  offers: Offer[];
  offerUsageRules: OfferUsageRule[];
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
