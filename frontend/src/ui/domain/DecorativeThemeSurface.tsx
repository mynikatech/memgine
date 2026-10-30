import type { ReactNode } from "react";
import { ImageBackground, View, type ViewProps } from "react-native";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { resolveDecoration } from "@/src/core/branding-decoration.types";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

export type DecorativeThemeSurfaceProps = Pick<ViewProps, "style" | "testID"> & {
  children: ReactNode;
  decoration?: Partial<BrandingDecorationConfig> | null;
  backgroundImageUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  kind?: "membership" | "benefit" | "offer" | "header";
};

/**
 * Festival-neutral decoration: colour, geometry and imagery are supplied by the
 * published theme or the exact preview snapshot. Never reads mutable branding.
 */
export function DecorativeThemeSurface({
  children, decoration, backgroundImageUrl, primaryColor, accentColor,
  backgroundColor, kind = "membership", style, testID,
}: DecorativeThemeSurfaceProps) {
  const d = resolveDecoration(decoration);
  if (d.style === "NONE" || d.cardTreatment === "SOLID") {
    return <View testID={testID} style={style}>{children}</View>;
  }
  const image = d.cardTreatment === "IMAGE_OVERLAY" ? resolveAssetUrl(backgroundImageUrl) : undefined;
  const isMembership = kind === "membership";
  const inset = image ? 0 : d.intensity === "FESTIVE" ? (isMembership ? 15 : 10)
    : d.intensity === "BALANCED" ? (isMembership ? 11 : 7) : 5;
  const radius = isMembership ? 18 : 12;
  const borderWidth = d.borderStyle === "ELEGANT" ? 1 : d.borderStyle === "SOLID" ? 1 : 0;
  const showCorners = d.style === "CORNERS" || d.style === "BORDER" || d.style === "CONFETTI";
  const showPattern = d.style === "PATTERN" || d.style === "CONFETTI";

  const art = (
    <>
      {showCorners && !image ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
          {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => (
            <View key={corner} style={{
              position: "absolute", width: isMembership ? 42 : 27, height: isMembership ? 42 : 27,
              top: corner.startsWith("top") ? 7 : undefined,
              bottom: corner.startsWith("bottom") ? 7 : undefined,
              left: corner.endsWith("Left") ? 7 : undefined,
              right: corner.endsWith("Right") ? 7 : undefined,
              borderTopWidth: corner.startsWith("top") ? 3 : 0,
              borderBottomWidth: corner.startsWith("bottom") ? 3 : 0,
              borderLeftWidth: corner.endsWith("Left") ? 3 : 0,
              borderRightWidth: corner.endsWith("Right") ? 3 : 0,
              borderColor: accentColor, opacity: 0.92,
              borderRadius: 3,
            }} />
          ))}
        </View>
      ) : null}
      {showPattern && !image && d.pattern !== "NONE" ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-evenly", alignItems: "center", opacity: d.intensity === "FESTIVE" ? 0.35 : 0.21 }}>
          {Array.from({ length: isMembership ? 22 : 12 }, (_, i) => (
            <View key={i} style={{ width: "16%", alignItems: "center" }}>
              <View style={{
                width: i % 2 === 0 ? 5 : 3, height: i % 2 === 0 ? 5 : 3,
                transform: d.pattern === "DIAMONDS" || d.pattern === "SPARKLES" ? [{ rotate: "45deg" }] : undefined,
                borderRadius: d.pattern === "DOTS" ? 10 : 1,
                backgroundColor: i % 2 === 0 ? primaryColor : accentColor,
              }}/>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
  const content = (
    <View style={{ padding: inset, minHeight: isMembership ? 172 : undefined }}>
      {art}
      {/* Deliberately leave space at the edges; the card's own content layer is
          supplied by its child component and never covered by decoration. */}
      <View style={{ borderRadius: image ? radius : radius - 5, overflow: "hidden" }}>{children}</View>
    </View>
  );
  return (
    <View testID={testID} style={[{ borderRadius: radius, overflow: "hidden", backgroundColor,
      borderWidth, borderColor: accentColor }, style]}>
      {image ? <ImageBackground source={{ uri: image }} resizeMode="cover" style={{ width: "100%" }}>{content}</ImageBackground>
        : content}
    </View>
  );
}
