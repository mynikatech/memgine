import type {
  BusinessConfiguration,
  CustomerExperienceDefinition,
  Organization,
} from "@/src/core";

/**
 * Customer-facing branding after all applicable sources have been resolved.
 *
 * Resolution order:
 *
 *   Proposed CustomerExperienceDefinition
 *        ↓
 *   Organization-owned configuration
 *        ↓
 *   Existing BusinessConfiguration defaults
 *
 * A missing logo is deliberately represented as undefined.
 * The UI is then responsible for rendering the organization monogram.
 */
export type ResolvedCustomerBranding = {
  displayName: string;

  logoUrl?: string;
  darkThemeLogoUrl?: string;
  faviconUrl?: string;
  splashScreenImageUrl?: string;

  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
};

type ResolveCustomerBrandingInput = {
  organization: Organization;

  configuration: BusinessConfiguration;

  previewDefinition?: CustomerExperienceDefinition;
};

export function resolveCustomerBranding({
  organization,
  configuration,
  previewDefinition,
}: ResolveCustomerBrandingInput): ResolvedCustomerBranding {
  const definition = previewDefinition;

  const displayName =
    definition?.businessIdentity.displayName?.trim() ||
    organization.name?.trim() ||
    configuration.identity.displayName;

  return {
    displayName,

    logoUrl:
      definition?.businessIdentity.logoUrl ??
      configuration.branding.logoUrl ??
      undefined,

    darkThemeLogoUrl:
      definition?.businessIdentity.darkThemeLogoUrl ??
      configuration.branding.darkThemeLogoUrl ??
      undefined,

    faviconUrl:
      definition?.businessIdentity.faviconUrl ??
      configuration.branding.faviconUrl ??
      undefined,

    splashScreenImageUrl:
      definition?.businessIdentity.splashScreenImageUrl ??
      configuration.branding.splashScreenImageUrl ??
      undefined,

    primaryColor:
      definition?.theme.primaryColor ?? configuration.branding.primaryColor,

    secondaryColor:
      definition?.theme.secondaryColor ?? configuration.branding.secondaryColor,

    accentColor:
      definition?.theme.accentColor ?? configuration.branding.accentColor,
  };
}
