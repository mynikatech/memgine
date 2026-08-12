import { BusinessConfiguration } from "../config/business-configuration";
import { BusinessContext } from "../context/business-context";
import { TemplateCategory } from "../domain/common";
import { ManagementModel, Organization, OrganizationAccount, PlanTier } from "../domain/entities";
import { CardStyle } from "../template/template-definition";
import { SALON_V1 } from "../template/salon-template-definition";

/**
 * Glow Studio — the single demo Salon business proving the salon-v1 template.
 * A completely different brand (rose/violet, classic cards, USD/en-US) rendered
 * by the SAME BusinessExperience renderer as Sunrise Bakery.
 */

export const GLOW_STUDIO_ORGANIZATION: Organization = {
  id: "org-glow",
  legalName: "Glow Studio Inc.",
  displayName: "Glow Studio",
  category: TemplateCategory.BEAUTY_AND_WELLNESS,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const GLOW_STUDIO_ACCOUNT: OrganizationAccount = {
  organizationId: "org-glow",
  planTier: PlanTier.PRO,
  managementModel: ManagementModel.SELF_SERVICE,
};

export const GLOW_STUDIO_CONFIGURATION: BusinessConfiguration = {
  templateId: SALON_V1.id,
  identity: {
    displayName: "Glow Studio",
    category: TemplateCategory.BEAUTY_AND_WELLNESS,
  },
  branding: {
    logoUrl: "https://placeholder.memgine.app/logos/glow-studio.png",
    primaryColor: "#DB2777",
    secondaryColor: "#7C3AED",
  },
  customerExperience: {
    welcomeMessage: "Welcome to Glow Studio — where your glow is the goal.",
    cardStyle: CardStyle.CLASSIC,
    showOffers: true,
    showStores: true,
    showActivity: true,
  },
  localization: {
    defaultLanguage: "en-US",
    defaultCurrency: "USD",
    timezone: "America/Los_Angeles",
  },
};

export const GLOW_STUDIO_CONTEXT: BusinessContext = {
  organization: GLOW_STUDIO_ORGANIZATION,
  account: GLOW_STUDIO_ACCOUNT,
  configuration: GLOW_STUDIO_CONFIGURATION,
  template: SALON_V1,
};
