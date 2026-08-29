import type { ID, ISODateString } from "../domain/common";
import type { TemplateDefaultContent } from "../template/template-content";
import { CardStyle } from "../template/template-definition";

/**
 * Customer-facing presentation configuration for an organization.
 *
 * TemplateDefinition remains Memgine-controlled and determines what the
 * experience is capable of displaying.
 */
export interface CustomerExperienceDefinition {
  businessIdentity: {
    displayName: string;
    tagline: string;
    logoUrl?: string;
    heroImageUrl?: string;
    darkThemeLogoUrl?: string;
    faviconUrl?: string;
    splashScreenImageUrl?: string;
  };

  theme: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
  };

  membership: {
    enabled: boolean;
    cardStyle?: CardStyle;
    headline?: string;
    description?: string;
  };

  sections: {
    businessIdentity: boolean;
    heroPromotion: boolean;
    featuredPromotion: boolean;
    membership: boolean;
    activeBenefits: boolean;
    offers: boolean;
    stores: boolean;
    activity: boolean;
    businessInformation: boolean;
    businessPreferences: boolean;
    referral: boolean;
  };

  /**
   * Presentation-only configuration for the Offers section.
   * Actual Offer records remain in Offer.
   */
  offersPresentation: {
    enabled: boolean;
    title: string;
    presentation: "LIST" | "GRID" | "FEATURED";
    showImages: boolean;
    showExpiry: boolean;
  };

  /** Organization-owned starter/customized content. */
  content: TemplateDefaultContent;
}

export type CustomerExperienceLifecycleStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED";

export interface CustomerExperience {
  id: ID;
  organizationId: ID;
  templateId: ID;
  experienceName: string;

  experienceDefinition: CustomerExperienceDefinition;

  /** Reference-data Status ID used by the current data model. */
  experienceStatusId: ID;

  /** Explicit application-level lifecycle state for the mock stage. */
  lifecycleStatus: CustomerExperienceLifecycleStatus;

  publishedAt?: ISODateString;
  publishedBy?: ID;

  createdAt: ISODateString;
  createdBy: ID;

  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}

export interface CustomerExperienceService {
  /**
   * Returns the organization's current DRAFT when one exists.
   * Otherwise initializes a draft from the platform template.
   */
  getCustomerExperience(organizationId: ID): Promise<CustomerExperience | null>;

  /**
   * Returns the currently published customer experience.
   * Null means the organization has not published a Customer Experience yet.
   */
  getPublishedCustomerExperience(
    organizationId: ID,
  ): Promise<CustomerExperience | null>;

  initializeCustomerExperience(
    organizationId: ID,
    templateId: ID,
    experienceName: string,
    content: CustomerExperienceDefinition,
    createdBy: ID,
  ): Promise<CustomerExperience>;

  updateCustomerExperience(
    organizationId: ID,
    experience: CustomerExperience,
  ): Promise<CustomerExperience>;

  /**
   * Publishes the current draft after validation.
   *
   * In the current mock implementation this also updates the
   * organization-owned content used by BusinessExperience.
   */
  publishCustomerExperience(
    organizationId: ID,
    publishedBy: ID,
  ): Promise<CustomerExperience>;
}
