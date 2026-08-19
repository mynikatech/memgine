import { ID, TemplateCategory } from "../domain/common";

import {
  ManagementModel,
  Organization,
  OrganizationAccount,
  PlanTier,
} from "../domain/entities";

import { BusinessConfiguration } from "../config/business-configuration";
import { BusinessContext } from "../context/business-context";

import { CardStyle } from "../template/template-definition";

import { getDefaultBusinessTemplate } from "../defaults/default-business-template";

import { registerBusinessContext } from "../defaults/business-registry";

export type OnboardOrganizationInput = {
  name: string;
  organizationType: string;
};

export type OnboardOrganizationResult = {
  organization: Organization;
  context: BusinessContext;
};

/**
 * Creates a NEW organization from a PLATFORM DEFAULT TEMPLATE.
 *
 * Existing organizations such as:
 *
 * - Sunrise Bakery
 * - Glow Studio
 * - Steep & Sip
 *
 * are tenant instances and are NEVER used as onboarding templates.
 *
 * Current implementation:
 *
 *   organization type
 *        ↓
 *   platform default template
 *        ↓
 *   new organization
 *        ↓
 *   new account
 *        ↓
 *   new configuration
 *        ↓
 *   new BusinessContext
 *        ↓
 *   registerBusinessContext()
 *
 * The in-memory implementation can later be replaced by the
 * backend onboarding API without changing the UI contract.
 */
export async function onboardOrganization(
  input: OnboardOrganizationInput,
): Promise<OnboardOrganizationResult> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Business name is required.");
  }

  const organizationType = input.organizationType.trim().toUpperCase();

  if (!organizationType) {
    throw new Error("Business type is required.");
  }

  /*
   * Resolve the PLATFORM template for the selected
   * organization type.
   *
   * Example:
   *
   * BAKERY      -> F&B Bakery template
   * COFFEE_SHOP -> F&B Bakery template
   * SALON       -> Salon template
   */
  const defaultTemplate = getDefaultBusinessTemplate(organizationType);

  const now = new Date().toISOString();

  /*
   * Generate a NEW organization ID.
   */
  const organizationId: ID = `org-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  /*
   * Resolve the organization category.
   *
   * The current supported onboarding types map to the
   * existing TemplateCategory enum.
   */
  const category =
    organizationType === "SALON"
      ? TemplateCategory.BEAUTY_AND_WELLNESS
      : TemplateCategory.FOOD_AND_BEVERAGE;

  /*
   * Resolve the organization type reference.
   *
   * These currently represent the existing mock/reference
   * data IDs. When platform reference data is connected,
   * this mapping should come from that service instead.
   */
  const organizationTypeId =
    organizationType === "SALON" ? "org-type-salon" : "org-type-food-beverage";

  /*
   * Create the NEW organization identity.
   *
   * No tenant identity is copied from Sunrise, Glow or
   * Steep & Sip.
   */
  const organization: Organization = {
    id: organizationId,

    code: organizationId.replace(/^org-/, "").toUpperCase(),

    name,

    displayName: name,

    organizationTypeId,

    organizationStatusId: "org-status-active",

    category,

    /*
     * Neutral initial contact values.
     *
     * These are configuration placeholders for the UI test
     * implementation. The Organization Admin can replace them.
     */
    primaryEmail: "support@example.com",

    primaryPhone: {
      countryId: "country-ca",
      callingCode: "+1",
      number: "0000000000",
    },

    website: "https://example.com",

    createdAt: now,
    createdBy: "platform-system",

    updatedAt: now,
    updatedBy: "platform-system",

    isDeleted: false,

    versionNo: 1,
  };

  /*
   * Create a NEW organization account.
   *
   * This is a platform onboarding default, not copied from
   * an existing organization.
   */
  const account: OrganizationAccount = {
    organizationId: organization.id,

    planTier: PlanTier.PRO,

    managementModel: ManagementModel.SELF_SERVICE,
  };

  /*
   * Create NEW organization-level configuration.
   *
   * The selected PLATFORM TEMPLATE determines the templateId.
   * Organization-specific presentation values are initialized
   * independently.
   */
  const configuration: BusinessConfiguration = {
    templateId: defaultTemplate.template.id,

    identity: {
      displayName: name,
      category,
    },

    branding: {
      logoUrl: "https://placeholder.memgine.app/logos/business.png",

      primaryColor: "#2563EB",

      secondaryColor: "#64748B",
    },

    customerExperience: {
      welcomeMessage: `Welcome to ${name}!`,

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

  /*
   * Build the actual BusinessContext.
   *
   * These are the four separate layers defined by your
   * BusinessContext contract:
   *
   * organization  -> NEW organization
   * account       -> NEW account defaults
   * configuration -> NEW configuration
   * template      -> PLATFORM template definition
   */
  const context: BusinessContext = {
    organization,

    account,

    configuration,

    template: defaultTemplate.template,
  };

  /*
   * Register the NEW organization using its NEW ID.
   *
   * This is necessary for the current in-memory/mock
   * implementation so BusinessProvider can resolve the
   * organization immediately after onboarding.
   */
  registerBusinessContext(context);

  console.log("PLATFORM ORGANIZATION CREATED", {
    organizationId: organization.id,

    organizationName: organization.name,

    organizationType,

    templateId: defaultTemplate.id,

    templateContentId: defaultTemplate.content.templateId,
  });

  return {
    organization,
    context,
  };
}
