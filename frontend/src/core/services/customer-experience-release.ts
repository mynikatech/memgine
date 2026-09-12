import type {
  Benefit,
  BenefitUsageRule,
  MembershipProduct,
  Offer,
  OfferUsageRule,
  Organization,
  OrganizationBranding,
  OrganizationDetails,
  ReferralProgram,
  Store,
} from "../domain/entities";
import type { ID, ISODateString } from "../domain/common";

import type { BusinessConfiguration } from "../config/business-configuration";
import type { TemplateDefinition } from "../template/template-definition";
import type { CustomerExperience } from "./customer-experience";

/**
 * Immutable organization-level customer-facing snapshot.
 *
 * This is a publication artifact, not a replacement for the individual
 * domain entities. Each source entity remains independently editable.
 *
 * Configuration and template are frozen because the customer renderer uses
 * them to resolve the published customer-facing experience. Usage rules are
 * included because Benefit/Offer renderers resolve them independently.
 */
export interface CustomerExperienceReleaseSnapshot {
  configuration: BusinessConfiguration;
  template: TemplateDefinition;
  customerExperience: CustomerExperience;
  organization: Organization;
  membershipProducts: MembershipProduct[];
  benefits: Benefit[];
  benefitUsageRules: BenefitUsageRule[];
  offers: Offer[];
  offerUsageRules: OfferUsageRule[];
  stores: Store[];
  referralProgram: ReferralProgram | null;
  organizationBranding?: OrganizationBranding | null;
  organizationDetails?: OrganizationDetails | null;
}

export interface CustomerExperienceReleaseContext {
  configuration: BusinessConfiguration;
  template: TemplateDefinition;
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
    context: CustomerExperienceReleaseContext,
  ): Promise<CustomerExperienceReleaseSnapshot>;

  publishRelease(
    organizationId: ID,
    customerExperience: CustomerExperience,
    publishedBy: ID,
    context: CustomerExperienceReleaseContext,
  ): Promise<CustomerExperienceRelease>;
}
