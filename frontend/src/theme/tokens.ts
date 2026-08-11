/**
 * Memgine — static design tokens (Stage 2 foundation).
 * These are Memgine-controlled primitives. A business can only override a
 * constrained subset (brand colors, logo) via its BusinessConfiguration —
 * never spacing/typography/structure. See ARCHITECTURE.md.
 */
export const SPACING = { xs: 8, sm: 16, md: 24, lg: 32, xl: 40 } as const;

export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const FONT_SIZE = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;

export const FONT_WEIGHT = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/** Neutral Memgine base palette (default brand). */
export const BASE_PALETTE = {
  background: "#FFFFFF",
  surface: "#F5F6F8",
  surfaceAlt: "#EEF1F4",
  border: "#E4E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  textInverse: "#FFFFFF",
  primary: "#0F766E",
  primarySoft: "#E6F2F1",
  onPrimary: "#FFFFFF",
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
} as const;

export const SHADOWS = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
