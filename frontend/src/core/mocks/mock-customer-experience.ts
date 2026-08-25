import type { ID } from "../domain/common";
import type { OrganizationService } from "../services/service-contracts";
import type { TemplateService } from "../services/template";

import type {
  CustomerExperience,
  CustomerExperienceDefinition,
  CustomerExperienceService,
} from "../services/customer-experience";

import { getDefaultBusinessTemplate } from "../defaults/default-business-template";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDefinition(
  templateContent: CustomerExperienceDefinition["content"],
): CustomerExperienceDefinition {
  return {
    businessIdentity: {
      displayName: templateContent.businessIdentity.displayName,
      tagline: templateContent.businessIdentity.tagline,
      logoUrl: templateContent.businessIdentity.logoUrl || undefined,
      heroImageUrl: templateContent.businessIdentity.heroImageUrl || undefined,
    },

    theme: {
      primaryColor: undefined,
      secondaryColor: undefined,
      accentColor: undefined,
      backgroundColor: undefined,
    },

    membership: {
      enabled: true,
      cardStyle: undefined,
      headline: templateContent.membership.tierName,
      description: templateContent.membership.description,
    },

    sections: {
      businessIdentity: true,
      heroPromotion: Boolean(templateContent.heroPromotion),
      featuredPromotion: Boolean(templateContent.featuredPromotion),
      membership: true,
      activeBenefits: true,
      offers: Boolean(templateContent.offers),
      stores: Boolean(templateContent.stores),
      activity: Boolean(templateContent.activity),
      businessInformation: Boolean(templateContent.businessInformation),
      businessPreferences: Boolean(templateContent.businessPreferences),
      referral: Boolean(templateContent.referral),
    },

    offersPresentation: {
      enabled: Boolean(templateContent.offers),
      title: "Offers",
      presentation: "LIST",
      showImages: true,
      showExpiry: true,
    },

    content: clone(templateContent),
  };
}

export class InMemoryCustomerExperienceService implements CustomerExperienceService {
  private readonly drafts = new Map<ID, CustomerExperience>();
  private readonly published = new Map<ID, CustomerExperience>();

  constructor(
    private readonly organizationService: OrganizationService,
    private readonly templateService: TemplateService,
  ) {}

  async getCustomerExperience(
    organizationId: ID,
  ): Promise<CustomerExperience | null> {
    const existingDraft = this.drafts.get(organizationId);

    if (existingDraft) {
      return clone(existingDraft);
    }

    const organization =
      await this.organizationService.getOrganization(organizationId);

    if (!organization) {
      return null;
    }

    const template = getDefaultBusinessTemplate(
      organization.organizationTypeId,
    );

    const catalogueTemplate = await this.templateService.getTemplate(
      template.id,
    );

    if (!catalogueTemplate) {
      return null;
    }

    const content = buildDefinition(catalogueTemplate.content);

    const branding =
      await this.organizationService.getOrganizationBranding(organizationId);

    content.businessIdentity.displayName =
      branding?.brandingName?.trim() || organization.displayName;

    content.businessIdentity.logoUrl = branding?.logoUrl || undefined;

    content.theme.primaryColor = branding?.primaryColor;
    content.theme.secondaryColor = branding?.secondaryColor;
    content.theme.accentColor = branding?.accentColor;

    const now = new Date().toISOString();

    const existingPublished = this.published.get(organizationId);

    const draft: CustomerExperience = {
      id: `customer-experience-${organizationId}`,

      organizationId,

      templateId: catalogueTemplate.id,

      experienceName: `${organization.displayName} Customer Experience`,

      experienceDefinition: content,

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      createdAt: now,
      createdBy: organization.createdBy,

      updatedAt: now,
      updatedBy: organization.updatedBy,

      isDeleted: false,

      versionNo: existingPublished ? existingPublished.versionNo + 1 : 1,
    };

    this.drafts.set(organizationId, clone(draft));

    return clone(draft);
  }

  async getPublishedCustomerExperience(
    organizationId: ID,
  ): Promise<CustomerExperience | null> {
    const existing = this.published.get(organizationId);

    return existing ? clone(existing) : null;
  }

  async initializeCustomerExperience(
    organizationId: ID,
    templateId: ID,
    experienceName: string,
    content: CustomerExperienceDefinition,
    createdBy: ID,
  ): Promise<CustomerExperience> {
    const existing = this.drafts.get(organizationId);

    if (existing) {
      return clone(existing);
    }

    const now = new Date().toISOString();

    const experience: CustomerExperience = {
      id: `customer-experience-${organizationId}`,

      organizationId,

      templateId,

      experienceName,

      experienceDefinition: clone(content),

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      createdAt: now,
      createdBy,

      updatedAt: now,
      updatedBy: createdBy,

      isDeleted: false,

      versionNo: 1,
    };

    this.drafts.set(organizationId, clone(experience));

    return clone(experience);
  }

  async updateCustomerExperience(
    organizationId: ID,
    experience: CustomerExperience,
  ): Promise<CustomerExperience> {
    const current = this.drafts.get(organizationId);

    const updated: CustomerExperience = {
      ...clone(experience),

      organizationId,

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      publishedAt: undefined,

      publishedBy: undefined,

      updatedAt: new Date().toISOString(),

      versionNo: (current?.versionNo ?? experience.versionNo) + 1,
    };

    this.drafts.set(organizationId, clone(updated));

    return clone(updated);
  }

  async publishCustomerExperience(
    organizationId: ID,
    publishedBy: ID,
  ): Promise<CustomerExperience> {
    const draft = this.drafts.get(organizationId);

    if (!draft) {
      throw new Error(
        `Customer Experience draft was not found for organization '${organizationId}'.`,
      );
    }

    if (!draft.experienceDefinition.businessIdentity.displayName.trim()) {
      throw new Error("Business display name is required before publishing.");
    }

    if (!draft.experienceDefinition.membership.enabled) {
      throw new Error(
        "Membership must be enabled before publishing the Customer Experience.",
      );
    }

    const now = new Date().toISOString();

    const published: CustomerExperience = {
      ...clone(draft),

      experienceStatusId: "status-published",

      lifecycleStatus: "PUBLISHED",

      publishedAt: now,

      publishedBy,

      updatedAt: now,

      updatedBy: publishedBy,
    };

    this.published.set(organizationId, clone(published));

    /**
     * Keep a fresh draft after publishing.
     *
     * This represents the next editable version and prevents the published
     * version from being modified directly.
     */
    const nextDraft: CustomerExperience = {
      ...clone(published),

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      publishedAt: undefined,

      publishedBy: undefined,

      updatedAt: now,

      updatedBy: publishedBy,

      versionNo: published.versionNo + 1,
    };

    this.drafts.set(organizationId, clone(nextDraft));

    return clone(published);
  }
}
