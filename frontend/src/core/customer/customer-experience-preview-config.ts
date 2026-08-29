import type {
  BusinessConfiguration,
  CustomerExperienceDefinition,
} from "@/src/core";

import { CardStyle } from "../template/template-definition";

/**
 * Converts an organization-owned Customer Experience definition into the
 * BusinessConfiguration consumed by the customer renderer.
 *
 * This is a preview/derived configuration adapter.
 *
 * OrganizationBranding remains the source-of-truth persistence entity.
 */
export function buildPreviewBusinessConfiguration(
  base: BusinessConfiguration,
  definition: CustomerExperienceDefinition,
): BusinessConfiguration {
  const configuredCardStyle = definition.membership.cardStyle;

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

      /*
       * Primary customer-facing logo.
       */
      logoUrl: definition.businessIdentity.logoUrl ?? base.branding.logoUrl,

      /*
       * Secondary branding assets.
       */
      darkThemeLogoUrl:
        definition.businessIdentity.darkThemeLogoUrl ??
        base.branding.darkThemeLogoUrl,

      faviconUrl:
        definition.businessIdentity.faviconUrl ?? base.branding.faviconUrl,

      splashScreenImageUrl:
        definition.businessIdentity.splashScreenImageUrl ??
        base.branding.splashScreenImageUrl,

      /*
       * Brand colours.
       */
      primaryColor: definition.theme.primaryColor ?? base.branding.primaryColor,

      secondaryColor:
        definition.theme.secondaryColor ?? base.branding.secondaryColor,

      accentColor: definition.theme.accentColor ?? base.branding.accentColor,
    },

    customerExperience: {
      ...base.customerExperience,

      cardStyle,

      showOffers:
        definition.sections.offers && definition.offersPresentation.enabled,

      showStores: definition.sections.stores,

      showActivity: definition.sections.activity,
    },
  };
}
