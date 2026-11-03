import "./branding-decoration.types";
import type { BrandingDecorationConfig } from "./branding-decoration.types";
import type { ThemeExperienceConfig } from "./theme-experience.types";

export type BrandingThemeV2 = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundImageUrl?: string | null;
  decoration?: BrandingDecorationConfig | null;
  // New Platform Admin configurable experience.
  themeExperience?: ThemeExperienceConfig | null;
};
export type BrandingAnnouncementV2 = {
  enabled: boolean;
  message?: string | null;
  style: "STATIC" | "FADE" | "SLIDE" | "TICKER";
  backgroundColor?: string | null;
  textColor?: string | null;
  linkUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};
export type BrandingV2 = BrandingThemeV2 & {
  announcement?: BrandingAnnouncementV2;
};
export type PlatformBrandingThemeV2 = {
  id: string;
  code: string;
  displayName: string;
  description?: string | null;
  draftTheme?: BrandingThemeV2 | null;
  publishedTheme?: BrandingThemeV2 | null;
  publicationStatus: "DRAFT" | "PUBLISHED";
  isActive: boolean;
  publishedAt?: string | null;
  versionNo: number;
};

/** Clean application-facing names. */
export type BrandingTheme = BrandingThemeV2;
export type PlatformBrandingTheme = PlatformBrandingThemeV2;

/** Optional clean names for the other types. */
export type BrandingConfiguration = BrandingV2;
export type BrandingAnnouncement = BrandingAnnouncementV2;
