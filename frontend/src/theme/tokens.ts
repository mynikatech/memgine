import { Platform } from "react-native";

/**
 * Base design tokens for the Memgine reusable UI foundation. Business branding
 * (from BusinessConfiguration) overrides the brand slots via buildTheme();
 * everything else is Memgine-owned. Cross-platform (Native + Web).
 */

export const SPACING = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const RADIUS = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const TYPOGRAPHY = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
} as const;

/** Neutral palette + fallback brand slots (overridden by business branding). */
export const BASE_COLORS = {
  background: "#FFFFFF",
  surface: "#F7F8FA",
  surfaceAlt: "#EEF1F4",
  card: "#FFFFFF",
  border: "#E4E7EB",
  borderStrong: "#CBD2D9",
  text: "#111827",
  textSecondary: "#374151",
  textMuted: "#6B7280",
  textInverse: "#FFFFFF",
  overlay: "rgba(17,24,39,0.45)",
  primary: "#0F766E",
  secondary: "#F59E0B",
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
} as const;

export const STATES = {
  pressedOpacity: 0.85,
  disabledOpacity: 0.45,
  pressedOverlay: "rgba(0,0,0,0.06)",
} as const;

const elevate = (offsetY: number, radius: number, opacity: number, elevation: number) =>
  Platform.select({
    web: { boxShadow: `0px ${offsetY}px ${radius}px rgba(17,24,39,${opacity})` } as object,
    default: {
      shadowColor: "#111827",
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: radius,
      shadowOpacity: opacity,
      elevation,
    },
  }) as object;

export const SHADOWS = {
  none: {},
  sm: elevate(2, 6, 0.06, 1),
  md: elevate(4, 12, 0.08, 3),
  lg: elevate(8, 24, 0.12, 6),
} as const;
