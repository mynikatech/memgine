import type { BusinessBranding } from "@/src/core";

import { shade, tint } from "./color-utils";
import { BASE_COLORS, RADIUS, SHADOWS, SPACING, STATES, TYPOGRAPHY } from "./tokens";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  overlay: string;
  primary: string;
  primarySoft: string;
  primaryStrong: string;
  onPrimary: string;
  secondary: string;
  secondarySoft: string;
  onSecondary: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
};

export type Theme = {
  colors: ThemeColors;
  typography: typeof TYPOGRAPHY;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  shadows: typeof SHADOWS;
  states: typeof STATES;
};

export type ThemeColorToken = keyof ThemeColors;
export type TypographyVariant = keyof typeof TYPOGRAPHY;

/**
 * Build a theme, letting BusinessConfiguration branding influence the brand
 * slots. All other tokens remain Memgine-owned.
 */
export function buildTheme(
  branding?: Pick<BusinessBranding, "primaryColor" | "secondaryColor">,
): Theme {
  const primary = branding?.primaryColor ?? BASE_COLORS.primary;
  const secondary = branding?.secondaryColor ?? BASE_COLORS.secondary;

  return {
    colors: {
      background: BASE_COLORS.background,
      surface: BASE_COLORS.surface,
      surfaceAlt: BASE_COLORS.surfaceAlt,
      card: BASE_COLORS.card,
      border: BASE_COLORS.border,
      borderStrong: BASE_COLORS.borderStrong,
      text: BASE_COLORS.text,
      textSecondary: BASE_COLORS.textSecondary,
      textMuted: BASE_COLORS.textMuted,
      textInverse: BASE_COLORS.textInverse,
      overlay: BASE_COLORS.overlay,
      primary,
      primarySoft: tint(primary, 0.85),
      primaryStrong: shade(primary, 0.18),
      onPrimary: "#FFFFFF",
      secondary,
      secondarySoft: tint(secondary, 0.85),
      onSecondary: "#FFFFFF",
      success: BASE_COLORS.success,
      successSoft: tint(BASE_COLORS.success, 0.85),
      warning: BASE_COLORS.warning,
      warningSoft: tint(BASE_COLORS.warning, 0.85),
      danger: BASE_COLORS.danger,
      dangerSoft: tint(BASE_COLORS.danger, 0.85),
      info: BASE_COLORS.info,
      infoSoft: tint(BASE_COLORS.info, 0.85),
    },
    typography: TYPOGRAPHY,
    spacing: SPACING,
    radius: RADIUS,
    shadows: SHADOWS,
    states: STATES,
  };
}

export const baseTheme = buildTheme();
