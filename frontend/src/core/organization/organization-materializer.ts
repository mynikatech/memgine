import type {
  ID,
  Organization,
  OrganizationAccount,
  OrganizationBranding,
  OrganizationDetails,
} from "@/src/core";

import { ManagementModel, PlanTier } from "../domain/entities";

import type { DefaultBusinessTemplate } from "../defaults/default-business-template";

import type { BusinessContext } from "../context/business-context";

import type { BusinessConfiguration } from "../config/business-configuration";

import { CardStyle } from "../template/template-definition";

export type MaterializedOrganization = {
  organization: Organization;
  account: OrganizationAccount;
  details: OrganizationDetails;
  branding: OrganizationBranding;
  context: BusinessContext;
};

/**
 * Creates the technical Organization ID.
 *
 * Organization ID and Organization Code are deliberately
 * independent identifiers.
 *
 * ID example:
 *   org-20260907-a7k3m9x2
 *
 * This value is immutable and is used for database relationships.
 */
function createOrganizationId(): ID {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const randomPart = Math.random().toString(36).slice(2, 10).toLowerCase();

  return `org-${datePart}-${randomPart}`;
}

export function materializeOrganization(
  input: {
    name: string;
    organizationCode: string;
    organizationTypeId: ID;
    primaryEmail: string;
    primaryPhone: {
      countryId: ID;
      callingCode: string;
      number: string;
    };
    useDefaultBusinessContent: boolean;
  },
  template: DefaultBusinessTemplate,
): MaterializedOrganization {
  console.log(
    "[materializeOrganization] useDefaultBusinessContent =",
    input.useDefaultBusinessContent,
  );

  console.log(
    "[materializeOrganization] template businessInformation.about =",
    template.content.businessInformation?.about,
  );

  const now = new Date().toISOString();

  /*
   * Technical ID and business Code are intentionally generated
   * independently.
   */
  const organizationId = createOrganizationId();

  const identity = template.content.businessIdentity;

  const businessInformation = template.content.businessInformation;

  const organization: Organization = {
    id: organizationId,

    /*
     * Human-readable, immutable Organization Code.
     *
     * Example:
     *   ORG-SUNRISE
     */
    code: input.organizationCode,

    name: input.name,

    displayName: input.name || identity.displayName,

    organizationTypeId: input.organizationTypeId,

    organizationStatusId: "status-active",

    primaryEmail: input.primaryEmail,

    primaryPhone: {
      countryId: input.primaryPhone.countryId,
      callingCode: input.primaryPhone.callingCode,
      number: input.primaryPhone.number,
    },

    website: businessInformation?.website,

    createdAt: now,
    createdBy: "platform-admin",

    updatedAt: now,
    updatedBy: "platform-admin",

    isDeleted: false,
    versionNo: 1,
  };

  const account: OrganizationAccount = {
    organizationId,

    planTier: PlanTier.PRO,

    managementModel: ManagementModel.SELF_SERVICE,
  };

  const details: OrganizationDetails = {
    id: createId("organization-details"),

    organizationId,

    registrationNumber: "",

    gstNumber: "",

    supportEmail: businessInformation?.supportEmail ?? "",

    supportPhone: {
      countryId: input.primaryPhone.countryId,
      callingCode: input.primaryPhone.callingCode,
      number: "",
    },

    aboutOrganization: input.useDefaultBusinessContent
      ? (businessInformation?.about ?? "")
      : "",

    address: {
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: "",
    },

    createdAt: now,
    createdBy: "platform-admin",

    updatedAt: now,
    updatedBy: "platform-admin",

    isDeleted: false,
    versionNo: 1,
  };

  console.log(
    "[materializeOrganization] details.aboutOrganization =",
    details.aboutOrganization,
  );

  const branding: OrganizationBranding = {
    id: createId("organization-branding"),

    organizationId,

    brandingName: organization.displayName ?? organization.name,

    /*
     * This is currently seeded from the selected platform
     * template. Later Branding Admin may change this to a
     * separately selectable visual theme.
     */
    themeTemplateId: template.template.id,

    logoUrl: identity.logoUrl,

    darkThemeLogoUrl: undefined,

    faviconUrl: undefined,

    splashScreenImageUrl: undefined,

    primaryColor: "#2563EB",

    secondaryColor: "#64748B",

    accentColor: "#FFFFFF",

    brandingStatusId: "entity-status-branding-active",

    createdAt: now,
    createdBy: "platform-admin",

    updatedAt: now,
    updatedBy: "platform-admin",

    isDeleted: false,
    versionNo: 1,
  };

  /*
   * BusinessConfiguration is application configuration and is not the
   * persisted Organization entity. Its existing identity.category value
   * continues to be derived from the selected template definition.
   *
   * This is deliberately separate from Organization.category, which no
   * longer exists in the physical Organization model.
   */
  const configuration: BusinessConfiguration = {
    templateId: template.template.id,

    identity: {
      displayName: organization.displayName ?? organization.name,

      category: template.template.category,
    },

    branding: {
      logoUrl: branding.logoUrl ?? "",

      primaryColor: branding.primaryColor ?? "#2563EB",

      secondaryColor: branding.secondaryColor,
    },

    customerExperience: {
      welcomeMessage:
        identity.tagline ??
        `Welcome to ${organization.displayName ?? organization.name}!`,

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

  const context: BusinessContext = {
    organization,

    account,

    configuration,

    template: template.template,
  };

  return {
    organization,
    account,
    details,
    branding,
    context,
  };
}

/**
 * Creates technical IDs for organization-owned records.
 */
function createId(prefix: string): ID {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
