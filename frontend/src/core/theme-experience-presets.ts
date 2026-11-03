import {
  DEFAULT_THEME_EXPERIENCE,
  type ThemeExperienceConfig,
} from "./theme-experience.types";

const PRESETS: Record<string, Partial<ThemeExperienceConfig>> = {
  christmas: {
    artStyle: "GIFT",
    featureTitle: "Celebrate Christmas",
    featureSubtitle: "Wishing you joy, warmth and wonderful rewards.",
    animationPreset: "TWINKLING_LIGHTS",
  },

  diwali: {
    artStyle: "LIGHTS",
    featureTitle: "Celebrate the Festival of Lights",
    featureSubtitle: "Wishing you happiness, light and prosperity.",
    animationPreset: "GLOW_BURST",
  },

  new_year: {
    artStyle: "CONFETTI",
    featureTitle: "Celebrate the New Year",
    featureSubtitle: "A new year of exciting moments and rewards.",
    animationPreset: "CONFETTI_POP",
  },

  valentines_day: {
    artStyle: "HEARTS",
    featureTitle: "Celebrate Together",
    featureSubtitle: "A little something special, just for you.",
    animationPreset: "SOFT_SPARKLES",
  },
};

export function themeExperienceForPlatformTheme(
  themeCode: string,
): ThemeExperienceConfig {
  const preset = PRESETS[themeCode.toLowerCase()];

  return {
    ...DEFAULT_THEME_EXPERIENCE,
    enabled: true,
    ...preset,
    featureImageUrl: null,
  };
}
