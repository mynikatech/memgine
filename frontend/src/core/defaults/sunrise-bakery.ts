import { BusinessConfiguration } from "../config/business-configuration";
import { BusinessContext } from "../context/business-context";
import { TemplateCategory } from "../domain/common";
import {
  ManagementModel,
  Organization,
  OrganizationAccount,
  PlanTier,
} from "../domain/entities";
import { CardStyle, F_AND_B_BAKERY_V1 } from "../template/template-definition";

/**
 * Default Café/Bakery example — "Sunrise Bakery". Demonstrates the frozen
 * BusinessConfiguration contract using the f-and-b-bakery-v1 template. This is
 * a configuration example only; onboarding is a later stage.
 */

export const SUNRISE_BAKERY_ORGANIZATION: Organization = {
  id: "org-sunrise",
  code: "SUNRISE",
  name: "Sunrise Bakery",
  legalName: "Sunrise Bakery LLC",
  displayName: "Sunrise Bakery",

  organizationTypeId: "org-type-food-beverage",
  organizationStatusId: "org-status-active",

  category: TemplateCategory.FOOD_AND_BEVERAGE,

  primaryEmail: "hello@sunrisebakery.ca",
  primaryPhone: {
    countryId: "country-ca",
    callingCode: "+1",
    number: "4165551233",
  },
  website: "https://sunrisebakery.ca",

  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "platform-system",
  updatedAt: "2026-06-01T00:00:00.000Z",
  updatedBy: "platform-system",

  isDeleted: false,
  versionNo: 1,
};

export const SUNRISE_BAKERY_ACCOUNT: OrganizationAccount = {
  organizationId: "org-sunrise",
  planTier: PlanTier.PRO,
  managementModel: ManagementModel.SELF_SERVICE,
};

export const SUNRISE_BAKERY_CONFIGURATION: BusinessConfiguration = {
  templateId: F_AND_B_BAKERY_V1.id,
  identity: {
    displayName: "Sunrise Bakery",
    category: TemplateCategory.FOOD_AND_BEVERAGE,
  },
  branding: {
    // Placeholder asset — no real upload/asset pipeline in this stage.
    logoUrl: "https://placeholder.memgine.app/logos/sunrise-bakery.png",
    primaryColor: "#C2410C",
    secondaryColor: "#F59E0B",
  },
  customerExperience: {
    welcomeMessage: "Welcome to Sunrise Bakery — fresh rewards every day!",
    cardStyle: CardStyle.MODERN,
    showOffers: true,
    showStores: true,
    showActivity: true,
  },
  localization: {
    defaultLanguage: "en-CA",
    defaultCurrency: "CAD",
    timezone: "America/Toronto",
  },
};

export const SUNRISE_BAKERY_CONTEXT: BusinessContext = {
  organization: SUNRISE_BAKERY_ORGANIZATION,
  account: SUNRISE_BAKERY_ACCOUNT,
  configuration: SUNRISE_BAKERY_CONFIGURATION,
  template: F_AND_B_BAKERY_V1,
};
