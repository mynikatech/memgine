import type {
  BusinessConfiguration,
  CustomerExperienceDefinition,
} from "@/src/core";

import { CardStyle } from "../template/template-definition";
/**
 * Converts the organization-owned Customer Experience definition into
 * the existing BusinessConfiguration shape used by BusinessExperience.
 *
 * This is a preview adapter only.
 *
 * Important:
 * - BusinessConfiguration remains the application's existing configuration
 *   model.
 * - CustomerExperienceDefinition remains the draft/proposed experience model.
 * - Domain data such as Offers, Benefits, Stores, Subscriptions and
 *   Redemptions is NOT copied into BusinessConfiguration.
 */
export function buildPreviewBusinessConfiguration(
  base: BusinessConfiguration,
  definition: CustomerExperienceDefinition,
): BusinessConfiguration {
  const configuredCardStyle = definition.membership.cardStyle;

  /**
   * CustomerExperienceDefinition currently stores cardStyle as string,
   * while BusinessConfiguration correctly uses the frozen CardStyle enum.
   *
   * Only accept a value supported by the existing CardStyle enum.
   */
  const cardStyle: CardStyle =
    configuredCardStyle === CardStyle.MODERN ||
    configuredCardStyle === CardStyle.CLASSIC ||
    configuredCardStyle === CardStyle.MINIMAL
      ? configuredCardStyle
      : base.customerExperience.cardStyle;

  return {
    ...base,

    identity: {
      ...base.identity,

      displayName:
        definition.businessIdentity.displayName.trim() ||
        base.identity.displayName,
    },

    branding: {
      ...base.branding,

      logoUrl: definition.businessIdentity.logoUrl ?? base.branding.logoUrl,

      primaryColor: definition.theme.primaryColor ?? base.branding.primaryColor,

      secondaryColor:
        definition.theme.secondaryColor ?? base.branding.secondaryColor,
    },

    customerExperience: {
      ...base.customerExperience,

      /**
       * The real BusinessExperience renderer already consumes these
       * configuration switches.
       */
      showOffers:
        definition.sections.offers && definition.offersPresentation.enabled,

      showStores: definition.sections.stores,

      showActivity: definition.sections.activity,

      cardStyle,
    },
  };
}
