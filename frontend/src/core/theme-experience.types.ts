export const THEME_ART_STYLES = [
  "NONE",
  "LIGHTS",
  "GIFT",
  "STARS",
  "HEARTS",
  "FLORAL",
  "CONFETTI",
  "ABSTRACT",
] as const;

export const THEME_ANIMATIONS = [
  "NONE",
  "SOFT_SPARKLES",
  "GLOW_BURST",
  "FLOATING_PARTICLES",
  "SHIMMER_SWEEP",
  "CONFETTI_POP",
  "TWINKLING_LIGHTS",
  "PETAL_DRIFT",
  "RIBBON_REVEAL",
  "STAR_TRAIL",
  "GENTLE_PULSE",
] as const;

export type ThemeArtStyle = (typeof THEME_ART_STYLES)[number];
export type ThemeAnimationPreset = (typeof THEME_ANIMATIONS)[number];

export interface ThemeExperienceConfig {
  enabled: boolean;
  headerEnabled: boolean;
  announcementEnabled: boolean;
  featureEnabled: boolean;
  membershipAccentEnabled: boolean;
  artStyle: ThemeArtStyle;
  featureTitle: string;
  featureSubtitle: string;
  featureImageUrl?: string | null;
  animationPreset: ThemeAnimationPreset;
  animationDurationMs: number;
}

export const DEFAULT_THEME_EXPERIENCE: ThemeExperienceConfig = {
  enabled: false,
  headerEnabled: true,
  announcementEnabled: true,
  featureEnabled: true,
  membershipAccentEnabled: false,
  artStyle: "STARS",
  featureTitle: "",
  featureSubtitle: "",
  featureImageUrl: null,
  animationPreset: "SOFT_SPARKLES",
  animationDurationMs: 2500,
};

export function resolveThemeExperience(
  value?: Partial<ThemeExperienceConfig> | null,
): ThemeExperienceConfig {
  return {
    ...DEFAULT_THEME_EXPERIENCE,
    ...value,
    animationDurationMs: Math.max(
      1500,
      Math.min(3000, value?.animationDurationMs ?? 2500),
    ),
  };
}
