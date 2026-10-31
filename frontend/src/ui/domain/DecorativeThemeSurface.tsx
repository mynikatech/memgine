import type { ReactNode } from "react";
import { ImageBackground, View, type ViewProps } from "react-native";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { resolveDecoration } from "@/src/core/branding-decoration.types";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

export type DecorativeThemeSurfaceProps = Pick<
  ViewProps,
  "style" | "testID"
> & {
  children: ReactNode;
  decoration?: Partial<BrandingDecorationConfig> | null;
  backgroundImageUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  kind?: "membership" | "benefit" | "offer" | "header";
};

/** Festival-neutral artwork. Content stays readable; image framing is subtle. */
export function DecorativeThemeSurface({
  children,
  decoration,
  backgroundImageUrl,
  primaryColor,
  accentColor,
  backgroundColor,
  kind = "membership",
  style,
  testID,
}: DecorativeThemeSurfaceProps) {
  const d = resolveDecoration(decoration);
  if (d.style === "NONE" || d.cardTreatment === "SOLID") {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }

  const image =
    d.cardTreatment === "IMAGE_OVERLAY"
      ? resolveAssetUrl(backgroundImageUrl)
      : null;
  const isMembership = kind === "membership";
  // Image artwork is a background, never a thick picture frame around content.
  // Keep the clear 2px seam while making the image visible via card treatment.
  const inset = image
    ? 2
    : d.intensity === "FESTIVE"
      ? isMembership
        ? 10
        : 7
      : d.intensity === "BALANCED"
        ? isMembership
          ? 8
          : 5
        : 3;
  const radius = isMembership ? 18 : 15;
  const borderWidth =
    d.borderStyle === "ELEGANT" || d.borderStyle === "SOLID" ? 1 : 0;
  const borderColor = image ? "rgba(30,41,59,0.13)" : accentColor;
  const showCorners =
    d.style === "CORNERS" || d.style === "BORDER" || d.style === "CONFETTI";
  const showPattern = d.style === "PATTERN" || d.style === "CONFETTI";

  const artwork = (
    <>
      {showCorners && !image ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        >
          {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map(
            (corner) => (
              <View
                key={corner}
                style={{
                  position: "absolute",
                  width: isMembership ? 34 : 24,
                  height: isMembership ? 34 : 24,
                  top: corner.startsWith("top") ? 7 : undefined,
                  bottom: corner.startsWith("bottom") ? 7 : undefined,
                  left: corner.endsWith("Left") ? 7 : undefined,
                  right: corner.endsWith("Right") ? 7 : undefined,
                  borderTopWidth: corner.startsWith("top") ? 2 : 0,
                  borderBottomWidth: corner.startsWith("bottom") ? 2 : 0,
                  borderLeftWidth: corner.endsWith("Left") ? 2 : 0,
                  borderRightWidth: corner.endsWith("Right") ? 2 : 0,
                  borderColor: accentColor,
                  opacity: 0.72,
                  borderRadius: 3,
                }}
              />
            ),
          )}
        </View>
      ) : null}
      {showPattern && !image && d.pattern !== "NONE" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-evenly",
            alignItems: "center",
            opacity: d.intensity === "FESTIVE" ? 0.26 : 0.16,
          }}
        >
          {Array.from({ length: isMembership ? 18 : 10 }, (_, i) => (
            <View key={i} style={{ width: "16%", alignItems: "center" }}>
              <View
                style={{
                  width: i % 2 === 0 ? 5 : 3,
                  height: i % 2 === 0 ? 5 : 3,
                  transform:
                    d.pattern === "DIAMONDS" || d.pattern === "SPARKLES"
                      ? [{ rotate: "45deg" }]
                      : undefined,
                  borderRadius: d.pattern === "DOTS" ? 10 : 1,
                  backgroundColor: i % 2 === 0 ? primaryColor : accentColor,
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </>
  );

  const content = (
    <View style={{ padding: inset, minHeight: isMembership ? 172 : undefined }}>
      {artwork}
      <View style={{ borderRadius: radius - 3, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );

  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    >
      {image ? (
        <ImageBackground
          source={{ uri: image }}
          resizeMode="cover"
          style={{ width: "100%" }}
        >
          {content}
        </ImageBackground>
      ) : (
        content
      )}
    </View>
  );
}
