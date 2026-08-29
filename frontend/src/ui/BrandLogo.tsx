import { Image, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type BrandLogoProps = {
  logoUrl?: string;
  monogram: string;
  size?: number;
  borderRadius?: number;
  testID?: string;
};

export function BrandLogo({
  logoUrl,
  monogram,
  size = 46,
  borderRadius,
  testID,
}: BrandLogoProps) {
  const theme = useTheme();

  const radius = borderRadius ?? theme.radius.md;

  const normalizedLogoUrl = logoUrl?.trim();

  const fallbackMonogram = monogram.trim().charAt(0).toUpperCase() || "?";

  /*
   * A configured logo takes precedence.
   */
  if (normalizedLogoUrl) {
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
          source={{ uri: normalizedLogoUrl }}
          resizeMode="contain"
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </View>
    );
  }

  /*
   * IMPORTANT:
   *
   * No logo is not an empty state.
   * The monogram is the platform's default customer-facing identity.
   */
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
