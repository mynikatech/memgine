import { useMemo, type ReactNode } from "react";

import { BusinessThemeScope, useTheme } from "@/src/providers";
import { readableForegroundOnSurface } from "@/src/theme/color-utils";
import type { Theme } from "@/src/theme/theme";

// The visual artwork remains behind a 92% white content panel. Theme tokens
// inside that panel must therefore be evaluated against white, not the page
// background or the arbitrary image below it.
const OVERLAY_CONTENT_SURFACE = "#FFFFFF";

export function overlayContentTheme(theme: Theme): Theme {
  const foreground = (color: string) =>
    readableForegroundOnSurface(OVERLAY_CONTENT_SURFACE, color);

  return {
    ...theme,
    colors: {
      ...theme.colors,
      surface: OVERLAY_CONTENT_SURFACE,
      surfaceAlt: "#F3F4F6",
      card: OVERLAY_CONTENT_SURFACE,
      text: foreground(theme.colors.text),
      textSecondary: foreground(theme.colors.textSecondary),
      textMuted: foreground(theme.colors.textMuted),
      primary: foreground(theme.colors.primary),
      secondary: foreground(theme.colors.secondary),
      accent: foreground(theme.colors.accent),
      success: foreground(theme.colors.success),
      warning: foreground(theme.colors.warning),
      danger: foreground(theme.colors.danger),
      info: foreground(theme.colors.info),
      border: "#D1D5DB",
    },
  };
}

export function useDecorativeContentTheme(enabled: boolean): Theme {
  const theme = useTheme();
  return useMemo(
    () => (enabled ? overlayContentTheme(theme) : theme),
    [enabled, theme],
  );
}

export function DecorativeContentThemeScope({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const theme = useDecorativeContentTheme(enabled);
  return enabled ? (
    <BusinessThemeScope theme={theme}>{children}</BusinessThemeScope>
  ) : (
    <>{children}</>
  );
}
