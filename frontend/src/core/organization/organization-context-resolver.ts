import type { BusinessContext } from "../context/business-context";
import type { ID } from "../domain/common";

import { apis } from "@/src/data";
import { getDefaultBusinessTemplate } from "../defaults/default-business-template";

import { CardStyle } from "../template/template-definition";

export async function resolveOrganizationContext(
  organizationId: ID,
): Promise<BusinessContext | null> {
  const result = await apis.organization.getAggregate(organizationId);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  const aggregate = result.data;

  if (!aggregate) {
    return null;
  }

  /*
   * The template is platform-owned.
   *
   * The organization stores the selected template ID on its
   * configuration/entity data, but the template definition
   * itself remains platform-owned.
   */
  const template = getDefaultBusinessTemplate(
    aggregate.organization.organizationTypeId,
  );

  /*
   * Runtime BusinessConfiguration is assembled from
   * organization-owned configuration plus platform defaults.
   *
   * It is NOT the template itself.
   */
  const configuration = {
    templateId: template.template.id,

    identity: {
      displayName: aggregate.organization.displayName,

      category: aggregate.organization.category,
    },

    branding: {
      logoUrl: aggregate.branding.logoUrl ?? "",

      primaryColor: aggregate.branding.primaryColor ?? "#2563EB",

      secondaryColor: aggregate.branding.secondaryColor,
    },

    customerExperience: {
      welcomeMessage:
        template.content.businessIdentity.tagline ??
        `Welcome to ${aggregate.organization.displayName}!`,

      cardStyle: template.template.supportedCardStyles[0] ?? CardStyle.MODERN,

      showOffers: true,
      showStores: true,
      showActivity: true,
    },

    localization: {
      /*
       * These defaults should later come from the organization's
       * persisted business preferences/localization entity.
       */
      defaultLanguage: "en-CA",
      defaultCurrency: "CAD",
      timezone: "America/Toronto",
    },
  };

  return {
    organization: aggregate.organization,

    account: aggregate.account,

    configuration,

    template: template.template,
  };
}
