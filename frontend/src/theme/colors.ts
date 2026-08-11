/**
 * Backwards-compatible token surface for the Stage 1 navigation shells.
 * Sourced from the canonical design tokens. New code should prefer
 * `useTheme()` (theme is business-configurable); these static values are used
 * only by the Memgine-branded staff shell and tab bars.
 */
import { BASE_PALETTE, RADIUS as R, SPACING as S } from "./tokens";

export const COLORS = {
  background: BASE_PALETTE.background,
  surface: BASE_PALETTE.surface,
  border: BASE_PALETTE.border,
  text: BASE_PALETTE.text,
  textMuted: BASE_PALETTE.textMuted,
  accent: BASE_PALETTE.primary,
  accentSoft: BASE_PALETTE.primarySoft,
} as const;

export const SPACING = S;
export const RADIUS = R;
