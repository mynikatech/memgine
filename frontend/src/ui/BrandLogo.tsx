import { Image, View } from "react-native";

import { useTheme } from "@/src/providers";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

import { Text } from "./Text";

type BrandLogoProps = {
  logoUrl?: string;
  monogram: string;
  size?: number;
  borderRadius?: number;
  fit?: "contain" | "cover";
  testID?: string;
};

export function BrandLogo({
  logoUrl,
  monogram,
  size = 46,
  borderRadius,
  fit = "contain",
  testID,
}: BrandLogoProps) {
  const theme = useTheme();

  const radius = borderRadius ?? theme.radius.md;

  const resolvedLogoUrl = resolveAssetUrl(logoUrl);

  const fallbackMonogram = monogram.trim().charAt(0).toUpperCase() || "?";

  if (resolvedLogoUrl) {
    return (
      <View
        testID={testID}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: theme.colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={{ uri: resolvedLogoUrl }}
          resizeMode={fit}
          style={{
            width: "100%",
            height: "100%",
            ...(fit === "contain"
              ? {
                  transform: [{ scale: 0.88 }],
                }
              : undefined),
          }}
        />
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        variant="h2"
        color="onPrimary"
        style={{
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {fallbackMonogram}
      </Text>
    </View>
  );
}
