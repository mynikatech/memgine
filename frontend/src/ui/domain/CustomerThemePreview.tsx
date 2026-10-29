import { View } from "react-native";

import type { BrandingThemeV2 } from "@/src/core";
import { Image, Text } from "@/src/ui";
import { API_BASE_URL } from "@/src/data/api/http-client";

/**
 * Read-only preview of theme styling with injectable customer content.
 * Platform Admin passes sample content; Org Admin can pass its actual content.
 * This is a preview shell, not the production customer page renderer.
 */
export type CustomerThemePreviewProps = {
  theme: BrandingThemeV2;
  businessName?: string;
  headline?: string;
  subtitle?: string;
  membershipName?: string;
  membershipDescription?: string;
  offerName?: string;
  offerTitle?: string;
  offerDescription?: string;
  compact?: boolean;
};

/** Resolve backend asset endpoints against the configured API origin, not the web origin. */
function imageUrl(value: string | null | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  const path = value.trim();
  if (
    /^https?:\/\//i.test(path) ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  )
    return path;
  if (path.startsWith("/api/"))
    return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
  if (path.startsWith("api/"))
    return `${API_BASE_URL.replace(/\/$/, "")}/${path}`;
  return undefined;
}

const validColor = (color: string | null | undefined, fallback: string) =>
  typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;

export function CustomerThemePreview({
  theme,
  businessName = "Sample Bakery",
  headline = "Something special for our members",
  subtitle = "Thoughtful rewards for everyday visits.",
  membershipName = "Silver Membership",
  membershipDescription = "Enjoy exclusive benefits with every visit.",
  offerName,
  offerTitle,
  offerDescription = "Discover exclusive offers and rewards.",
  compact = false,
}: CustomerThemePreviewProps) {
  const primary = validColor(theme.primaryColor, "#0F766E");
  const secondary = validColor(theme.secondaryColor, "#115E59");
  const accent = validColor(theme.accentColor, "#F59E0B");
  const background = validColor(theme.backgroundColor, "#FFFFFF");
  const foreground = validColor(theme.textColor, "#1F2937");
  const space = compact ? 10 : 16;
  const backgroundImage = imageUrl(theme.backgroundImageUrl);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: background,
      }}
    >
      <View
        style={{
          backgroundColor: primary,
          paddingHorizontal: space,
          paddingVertical: compact ? 9 : 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          variant={compact ? "bodySmall" : "h3"}
          style={{ color: "#FFFFFF", flexShrink: 1 }}
        >
          {businessName}
        </Text>
        {!compact ? (
          <Text variant="bodySmall" style={{ color: "#FFFFFF" }}>
            Memberships ┬╖ Offers
          </Text>
        ) : null}
      </View>
      <View style={{ padding: space, gap: compact ? 8 : 12 }}>
        <View
          style={{
            borderRadius: 10,
            backgroundColor: secondary,
            overflow: "hidden",
          }}
        >
          {backgroundImage ? (
            <Image
              source={{ uri: backgroundImage }}
              style={{ width: "100%", height: compact ? 68 : 150 }}
              resizeMode="cover"
            />
          ) : null}
          <View style={{ padding: space, gap: 8 }}>
            <Text
              variant={compact ? "body" : "h3"}
              style={{ color: "#FFFFFF" }}
            >
              {headline}
            </Text>
            {!compact ? (
              <Text variant="bodySmall" style={{ color: "#FFFFFF" }}>
                {subtitle}
              </Text>
            ) : null}
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: accent,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 6,
              }}
            >
              <Text variant="bodySmall" style={{ color: "#17212B" }}>
                Explore Memberships
              </Text>
            </View>
          </View>
        </View>
        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: space,
            borderRadius: 9,
            gap: 4,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Text variant="body" style={{ color: foreground }}>
            {membershipName}
          </Text>
          {!compact ? (
            <Text variant="bodySmall" style={{ color: foreground }}>
              {membershipDescription}
            </Text>
          ) : null}
          <Text variant="bodySmall" style={{ color: primary }}>
            View Membership
          </Text>
        </View>
        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: space,
            borderRadius: 9,
            gap: 4,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Text variant="body" style={{ color: foreground }}>
            {offerTitle ?? offerName ?? "Seasonal offers"}
          </Text>
          {!compact ? (
            <Text variant="bodySmall" style={{ color: foreground }}>
              {offerDescription}
            </Text>
          ) : null}
          <Text variant="bodySmall" style={{ color: primary }}>
            Explore Offers
          </Text>
        </View>
      </View>
    </View>
  );
}
