import type { ReactNode } from "react";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { DecorativeThemeSurface } from "./DecorativeThemeSurface";

type Props = { children: ReactNode; imageUrl?: string | null; primaryColor: string;
 accentColor: string; backgroundColor?: string; decoration?: BrandingDecorationConfig | null;
 variant?: "membership" | "content"; };
export function DecorativeThemeFrame({ children, imageUrl, primaryColor, accentColor,
 backgroundColor = "#FFFFFF", decoration, variant = "content" }: Props) {
 return <DecorativeThemeSurface kind={variant === "membership" ? "membership" : "benefit"}
  decoration={decoration} backgroundImageUrl={imageUrl}
  primaryColor={primaryColor} accentColor={accentColor} backgroundColor={backgroundColor}>
   {children}
 </DecorativeThemeSurface>;
}
