import type { ReactNode } from "react";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { FestiveSurface, type FestiveThemeId } from "./FestiveThemeSurface";

type Props = {
  children: ReactNode;
  imageUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor?: string;
  decoration?: BrandingDecorationConfig | null;
  variant?: "membership" | "content";
  festiveTheme?: FestiveThemeId;
};

/** Decorations are fixed by the theme code; old uploaded images and decoration controls are ignored. */
export function DecorativeThemeFrame({
  children, accentColor, festiveTheme = "CLASSIC", variant,
}: Props) {
  return <FestiveSurface theme={festiveTheme} accent={accentColor} kind={variant === "content" ? "offer" : "card"}>{children}</FestiveSurface>;
}
