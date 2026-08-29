import { BusinessConfiguration } from "../config/business-configuration";
import { BusinessContext } from "../context/business-context";
import { TemplateCategory } from "../domain/common";
import {
  ManagementModel,
  Organization,
  OrganizationAccount,
  PlanTier,
} from "../domain/entities";
import { CardStyle } from "../template/template-definition";
import { COFFEE_CHAIN_V1 } from "../template/coffee-chain-template-definition";

/**
 * Default Café/Bakery example — "STEEP & SIP".
 *
 * Demonstrates a new organization using the default
 * F&B Bakery template without any organization-specific
 * template customization.
 *
 * This is configuration/example data only. The actual
 * onboarding flow will create these records through the
 * service layer later.
 */

export const STEEP_SIP_ORGANIZATION: Organization = {
  id: "org-steep-sip",
  code: "STEEP_SIP",
  name: "STEEP & SIP",
  legalName: "STEEP & SIP",
  displayName: "STEEP & SIP",

  organizationTypeId: "organization-type-coffee",
  organizationStatusId: "org-status-active",

  category: TemplateCategory.FOOD_AND_BEVERAGE,

  primaryEmail: "hello@steepandsip.com",
  primaryPhone: {
    countryId: "country-in",
    callingCode: "+91",
    number: "9000000000",
  },
  website: "https://steepandsip.com",

  createdAt: "2026-08-17T00:00:00.000Z",
  createdBy: "platform-system",
  updatedAt: "2026-08-17T00:00:00.000Z",
  updatedBy: "platform-system",

  isDeleted: false,
  versionNo: 1,
};

export const STEEP_SIP_ACCOUNT: OrganizationAccount = {
  organizationId: "org-steep-sip",
  planTier: PlanTier.PRO,
  managementModel: ManagementModel.SELF_SERVICE,
};

export const STEEP_SIP_CONFIGURATION: BusinessConfiguration = {
  /*
   * STEEP & SIP deliberately uses the existing default
   * Coffee/Bakery template. No custom template is being
   * created for this organization.
   */
  templateId: COFFEE_CHAIN_V1.id,

  identity: {
    displayName: "STEEP & SIP",
    category: TemplateCategory.FOOD_AND_BEVERAGE,
  },

  branding: {
    /*
     * Temporary demo assets.
     * These will eventually be replaced by the proper
     * Asset/Storage implementation.
     */
    logoUrl: "https://placeholder.memgine.app/logos/steep-and-sip.png",

    /*
     * Keep the default Coffee/Bakery visual direction for
     * the first demo. Organization-level customization
     * will be demonstrated later through Org Admin.
     */
    primaryColor: "#7A4B32",
    secondaryColor: "#E8D5C4",
  },

  customerExperience: {
    welcomeMessage: "Welcome to STEEP & SIP — crafted moments, every day!",

    cardStyle: CardStyle.MODERN,

    showOffers: true,
    showStores: true,
    showActivity: true,
  },

  localization: {
    defaultLanguage: "en-IN",
    defaultCurrency: "INR",
    timezone: "Asia/Kolkata",
  },
};

export const STEEP_SIP_CONTEXT: BusinessContext = {
  organization: STEEP_SIP_ORGANIZATION,
  account: STEEP_SIP_ACCOUNT,
  configuration: STEEP_SIP_CONFIGURATION,
  template: COFFEE_CHAIN_V1,
};
