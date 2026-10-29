import { Image, View } from "react-native";

import type { BrandingThemeV2 } from "@/src/core";
import { Text } from "@/src/ui/Text";

/**
 * Reusable, read-only customer-experience theme preview.
 * Hosts provide the theme and either sample or organization-specific content.
 * No publication, routing or mutation is performed here.
 */
export type CustomerThemePreviewProps = {
  theme: BrandingThemeV2;
  businessName?: string;
  headline?: string;
  subtitle?: string;
  membershipName?: string;
  membershipDescription?: string;
  offerTitle?: string;
  offerDescription?: string;
  compact?: boolean;
};

function safeColor(value: string | undefined | null, fallback: string) {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function CustomerThemePreview({
  theme,
  businessName = "Sample Bakery",
  headline = "A little more to love",
  subtitle = "Memberships, rewards and special experiences for your everyday visits.",
  membershipName = "Silver Membership",
  membershipDescription = "Discover exclusive benefits for members.",
  offerTitle = "Member offers",
  offerDescription = "Explore something special this season.",
  compact = false,
}: CustomerThemePreviewProps) {
  const primary = safeColor(theme.primaryColor, "#0F766E");
  const secondary = safeColor(theme.secondaryColor, "#115E59");
  const accent = safeColor(theme.accentColor, "#F59E0B");
  const background = safeColor(theme.backgroundColor, "#FFFFFF");
  const foreground = safeColor(theme.textColor, "#1F2937");
  const spacing = compact ? 10 : 16;

  return (
    <View style={{ backgroundColor: background, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E2E8F0" }}>
      <View style={{ backgroundColor: primary, paddingHorizontal: spacing, paddingVertical: compact ? 9 : 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant={compact ? "bodySmall" : "h3"} style={{ color: "#FFFFFF" }}>{businessName}</Text>
        <Text variant="bodySmall" style={{ color: "#FFFFFF" }}>Memberships  ·  Offers</Text>
      </View>

      <View style={{ padding: spacing, gap: compact ? 8 : 12 }}>
        <View style={{ backgroundColor: secondary, borderRadius: 10, overflow: "hidden" }}>
          {theme.backgroundImageUrl ? (
            <Image source={{ uri: theme.backgroundImageUrl }} style={{ width: "100%", height: compact ? 56 : 146 }} resizeMode="cover" />
          ) : null}
          <View style={{ padding: spacing, gap: 7 }}>
            <Text variant={compact ? "body" : "h3"} style={{ color: "#FFFFFF" }}>{headline}</Text>
            {!compact ? <Text variant="bodySmall" style={{ color: "#FFFFFF" }}>{subtitle}</Text> : null}
            <View style={{ alignSelf: "flex-start", paddingVertical: 7, paddingHorizontal: 11, borderRadius: 6, backgroundColor: accent }}>
              <Text variant="bodySmall" style={{ color: "#19202A" }}>Explore Memberships</Text>
            </View>
          </View>
        </View>
        <View style={{ padding: spacing, backgroundColor: "#FFFFFF", borderRadius: 9, borderWidth: 1, borderColor: "#E5E7EB", gap: 5 }}>
          <Text variant="body" style={{ color: foreground }}>{membershipName}</Text>
          {!compact ? <Text variant="bodySmall" style={{ color: foreground }}>{membershipDescription}</Text> : null}
          <Text variant="bodySmall" style={{ color: primary }}>View Membership</Text>
        </View>
        <View style={{ padding: spacing, backgroundColor: "#FFFFFF", borderRadius: 9, borderWidth: 1, borderColor: "#E5E7EB", gap: 5 }}>
          <Text variant="body" style={{ color: foreground }}>{offerTitle}</Text>
          {!compact ? <Text variant="bodySmall" style={{ color: foreground }}>{offerDescription}</Text> : null}
          <Text variant="bodySmall" style={{ color: primary }}>Explore Offers</Text>
        </View>
      </View>
    </View>
  );
}
