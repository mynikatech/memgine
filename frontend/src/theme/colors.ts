/**
 * Memgine — neutral foundation theme tokens.
 * Minimal palette used only for placeholder navigation shells.
 * The full theme engine is a later stage and is intentionally NOT built here.
 */
export const COLORS = {
  background: "#FFFFFF",
  surface: "#F5F6F8",
  border: "#E4E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  accent: "#0F766E",
  accentSoft: "#E6F2F1",
} as const;

export const SPACING = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
