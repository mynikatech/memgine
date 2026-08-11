import {
  BASE_PALETTE,
  FONT_SIZE,
  FONT_WEIGHT,
  RADIUS,
  SHADOWS,
  SPACING,
} from "./tokens";

/**
 * Branding = the constrained slice of theme a business is allowed to control.
 * Everything else (spacing, typography, radius, shadows) stays Memgine-owned.
 */
export type Branding = {
  name: string;
  logoText: string;
  primary?: string;
  primarySoft?: string;
  onPrimary?: string;
  background?: string;
};

export type ThemeColors = { [K in keyof typeof BASE_PALETTE]: string };

export type Theme = {
  colors: ThemeColors;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  fontSize: typeof FONT_SIZE;
  fontWeight: typeof FONT_WEIGHT;
  shadows: typeof SHADOWS;
  branding: { name: string; logoText: string };
};

export const MEMGINE_BRANDING: Branding = { name: "Memgine", logoText: "memgine" };

/** Merge a business branding on top of the Memgine base tokens. */
export function createTheme(branding: Branding = MEMGINE_BRANDING): Theme {
  const colors: ThemeColors = {
    ...BASE_PALETTE,
    ...(branding.primary ? { primary: branding.primary } : {}),
    ...(branding.primarySoft ? { primarySoft: branding.primarySoft } : {}),
    ...(branding.onPrimary ? { onPrimary: branding.onPrimary } : {}),
    ...(branding.background ? { background: branding.background } : {}),
  };
  return {
    colors,
    spacing: SPACING,
    radius: RADIUS,
    fontSize: FONT_SIZE,
    fontWeight: FONT_WEIGHT,
    shadows: SHADOWS,
    branding: { name: branding.name, logoText: branding.logoText },
  };
}

/** Default (unbranded) Memgine theme. */
export const baseTheme = createTheme();
