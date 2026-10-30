import { View } from "react-native";
import { FestiveRibbonFrame, FestiveSurface, festiveRibbonPalette, festiveThemeId } from "./FestiveThemeSurface";

import type { BrandingThemeV2 } from "@/src/core";
import { Image, Text } from "@/src/ui";
import { API_BASE_URL } from "@/src/data/api/http-client";
import { readableForeground, readableForegroundOnSurface } from "@/src/theme/color-utils";

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
  themeCode?: string | null;
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
  themeCode,
}: CustomerThemePreviewProps) {
  const primary = validColor(theme.primaryColor, "#0F766E");
  const secondary = validColor(theme.secondaryColor, "#115E59");
  const accent = validColor(theme.accentColor, "#F59E0B");
  const background = validColor(theme.backgroundColor, "#FFFFFF");
  const foreground = validColor(theme.textColor, "#1F2937");
  const space = compact ? 10 : 16;
  const themeId = festiveThemeId(themeCode);
  const ribbon = festiveRibbonPalette(themeId);
  const cardForeground = readableForegroundOnSurface("#FFFFFF", foreground);
  const heroForeground = readableForeground(secondary);
  const headerForeground = readableForeground(primary);
  const backgroundImage = themeId === "CLASSIC" ? imageUrl(theme.backgroundImageUrl) : undefined;

  return (
    <FestiveSurface theme={themeId} accent={accent} kind="page"
      style={{
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: background,
      }}
    >
      <FestiveSurface theme={themeId} accent={accent} kind="header"
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
          style={{ color: headerForeground, flexShrink: 1 }}
        >
          {businessName}
        </Text>
        {!compact ? (
          <Text variant="bodySmall" style={{ color: headerForeground }}>
            Memberships · Offers
          </Text>
        ) : null}
      </FestiveSurface>
      <View style={{ padding: space, gap: compact ? 8 : 12 }}>
        {ribbon ? <FestiveRibbonFrame theme={themeId} accent={accent}>
          <View style={{ backgroundColor: ribbon.background, paddingHorizontal: compact ? 58 : 70, paddingVertical: compact ? 11 : 18, minHeight: compact ? 48 : 70, justifyContent: "center" }}>
            <Text variant={compact ? "bodySmall" : "body"} style={{ color: ribbon.foreground, fontWeight: "700" }}>A special treat for our members</Text>
            {!compact ? <Text variant="bodySmall" style={{ color: ribbon.foreground }}>Explore your latest rewards</Text> : null}
          </View>
        </FestiveRibbonFrame> : null}
        <FestiveSurface theme={themeId} accent={accent} kind="hero"
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
              style={{ color: heroForeground }}
            >
              {headline}
            </Text>
            {!compact ? (
              <Text variant="bodySmall" style={{ color: heroForeground }}>
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
              <Text variant="bodySmall" style={{ color: readableForeground(accent) }}>
                Explore Memberships
              </Text>
            </View>
          </View>
        </FestiveSurface>
        <FestiveSurface theme={themeId} accent={accent} kind="membership">
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
          <Text variant="body" style={{ color: cardForeground }}>
            {membershipName}
          </Text>
          {!compact ? (
            <Text variant="bodySmall" style={{ color: cardForeground }}>
              {membershipDescription}
            </Text>
          ) : null}
          <Text variant="bodySmall" style={{ color: primary }}>
            View Membership
          </Text>
        </View>
        </FestiveSurface>
        <FestiveSurface theme={themeId} accent={accent} kind="benefit">
          <View style={{ backgroundColor: "#FFFFFF", padding: space, borderRadius: 9, borderWidth: 1, borderColor: "#E5E7EB", gap: 4 }}>
            <Text variant="body" style={{ color: cardForeground }}>Member benefit</Text>
            {!compact ? <Text variant="bodySmall" style={{ color: cardForeground }}>A reward available with your membership</Text> : null}
          </View>
        </FestiveSurface>
        <FestiveSurface theme={themeId} accent={accent} kind="offer">
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
          <Text variant="body" style={{ color: cardForeground }}>
            {offerTitle ?? offerName ?? "Seasonal offers"}
          </Text>
          {!compact ? (
            <Text variant="bodySmall" style={{ color: cardForeground }}>
              {offerDescription}
            </Text>
          ) : null}
          <Text variant="bodySmall" style={{ color: primary }}>
            Explore Offers
          </Text>
        </View>
        </FestiveSurface>
      </View>
    </FestiveSurface>
  );
}
