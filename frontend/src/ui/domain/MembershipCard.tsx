import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { CardStyle, type Status } from "@/src/core";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { useTheme } from "@/src/providers";
import { BrandLogo } from "../BrandLogo";
import { Text } from "../Text";
import { DecorativeThemeSurface } from "./DecorativeThemeSurface";

type MembershipCardProps = {
  organizationName: string; logoUrl?: string; tier: string;
  validUntil: string; status?: Status | null; cardStyle?: CardStyle; testID?: string;
  decoration?: BrandingDecorationConfig | null;
  decorationImageUrl?: string | null;
  decorationBackgroundColor?: string;
};

/** Display-only membership card; no QR, payment or entitlement logic lives here. */
export function MembershipCard({
  organizationName, logoUrl, tier, validUntil, status,
  cardStyle = CardStyle.MODERN, testID,
  decoration, decorationImageUrl, decorationBackgroundColor,
}: MembershipCardProps) {
  const theme = useTheme();
  const initial = organizationName.trim().charAt(0).toUpperCase();
  const active = status?.statusCode === "ACTIVE";
  const surface = cardStyle === CardStyle.CLASSIC ? theme.colors.primarySoft
    : cardStyle === CardStyle.MINIMAL ? theme.colors.background : theme.colors.card;
  const showAccentBar = cardStyle !== CardStyle.MINIMAL;
  const decorative = !!decoration && decoration.style !== "NONE" && decoration.cardTreatment !== "SOLID";

  const card = (
    <View style={[{
      borderRadius: decorative ? 12 : theme.radius.lg,
      borderWidth: decorative ? 0 : 1,
      borderColor: cardStyle === CardStyle.CLASSIC ? theme.colors.primarySoft : theme.colors.border,
      backgroundColor: decorative && decorationImageUrl ? "rgba(255,255,255,0.15)" : surface,
      overflow: "hidden", minHeight: 172,
    }, decorative ? undefined : cardStyle === CardStyle.MINIMAL ? theme.shadows.sm : theme.shadows.md]}>
      {showAccentBar ? <View style={{ height: 6, backgroundColor: theme.colors.primary }} /> : null}
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg,
        flex: 1, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flex: 1 }}>
            <BrandLogo logoUrl={logoUrl} monogram={initial} fit="cover" size={40} borderRadius={theme.radius.md} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">MEMBERSHIP</Text>
              <Text variant="bodyStrong" color="text">{organizationName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: active ? theme.colors.successSoft : theme.colors.surfaceAlt,
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill }}>
            <Ionicons name={active ? "checkmark-circle" : "time-outline"} size={13}
              color={active ? theme.colors.success : theme.colors.textMuted} />
            <Text variant="caption" color={active ? "success" : "textMuted"}>
              {status?.statusName ?? "—"}
            </Text>
          </View>
        </View>
        <View>
          <Text variant="display" color="text">{tier || "Membership"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="textMuted">Valid until {validUntil}</Text>
          </View>
        </View>
      </View>
    </View>
  );
  if (!decorative) return <View testID={testID}>{card}</View>;
  return (
    <DecorativeThemeSurface testID={testID} kind="membership" decoration={decoration}
      backgroundImageUrl={decorationImageUrl} primaryColor={theme.colors.primary}
      accentColor={theme.colors.accent}
      backgroundColor={decorationBackgroundColor ?? theme.colors.background}>
      {card}
    </DecorativeThemeSurface>
  );
}
