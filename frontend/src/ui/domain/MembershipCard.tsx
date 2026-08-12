import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { CardStyle } from "@/src/core";
import { useTheme } from "@/src/providers";

import { Text } from "../Text";

/**
 * MembershipCard — reusable PRESENTATION of a customer's subscription card.
 * Premium light treatment: the organization's brand colour is used as a
 * restrained ACCENT (accent bar, monogram chip, typography, status) rather than
 * a full solid/gradient fill. Honours the template's supported card styles.
 * Presentation only (no purchase / QR / redemption behaviour).
 */
type MembershipCardProps = {
  organizationName: string;
  tier: string;
  validUntil: string;
  active?: boolean;
  cardStyle?: CardStyle;
  testID?: string;
};

export function MembershipCard({
  organizationName,
  tier,
  validUntil,
  active = true,
  cardStyle = CardStyle.MODERN,
  testID,
}: MembershipCardProps) {
  const theme = useTheme();
  const initial = organizationName.trim().charAt(0).toUpperCase();

  // Surface treatment varies by card style; brand colour stays an accent.
  const surface =
    cardStyle === CardStyle.CLASSIC
      ? theme.colors.primarySoft
      : cardStyle === CardStyle.MINIMAL
        ? theme.colors.background
        : theme.colors.card;
  const showAccentBar = cardStyle !== CardStyle.MINIMAL;

  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: cardStyle === CardStyle.CLASSIC ? theme.colors.primarySoft : theme.colors.border,
          backgroundColor: surface,
          overflow: "hidden",
          minHeight: 172,
        },
        cardStyle === CardStyle.MINIMAL ? theme.shadows.sm : theme.shadows.md,
      ]}
    >
      {showAccentBar ? <View style={{ height: 6, backgroundColor: theme.colors.primary }} /> : null}
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg, flex: 1, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flex: 1 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="title" color="primary">
                {initial}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                MEMBERSHIP
              </Text>
              <Text variant="bodyStrong" color="text">
                {organizationName}
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: active ? theme.colors.successSoft : theme.colors.surfaceAlt,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.radius.pill,
            }}
          >
            <Ionicons
              name={active ? "checkmark-circle" : "time-outline"}
              size={13}
              color={active ? theme.colors.success : theme.colors.textMuted}
            />
            <Text variant="caption" color={active ? "success" : "textMuted"}>
              {active ? "Active" : "Expired"}
            </Text>
          </View>
        </View>

        <View>
          <Text variant="display" color="text">
            {tier} Member
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="textMuted">
              Valid until {validUntil}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
