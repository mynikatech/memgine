import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";

import { CardStyle } from "@/src/core";
import { useTheme } from "@/src/providers";
import { shade } from "@/src/theme/color-utils";
import type { ThemeColorToken } from "@/src/theme/theme";

import { Text } from "../Text";

/**
 * MembershipCard — reusable PRESENTATION of a customer's subscription card.
 * Honours the template's supported card styles. Presentation only (no
 * purchase / QR / redemption behaviour).
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
  const isModern = cardStyle === CardStyle.MODERN;
  const fg: ThemeColorToken = isModern ? "onPrimary" : "text";
  const sub: ThemeColorToken = isModern ? "onPrimary" : "textMuted";
  const initial = organizationName.trim().charAt(0).toUpperCase();

  const inner = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flex: 1 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: theme.radius.sm,
              backgroundColor: isModern ? "rgba(255,255,255,0.18)" : theme.colors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="label" color={isModern ? "onPrimary" : "primary"}>
              {initial}
            </Text>
          </View>
          <Text variant="bodySmall" color={sub} style={isModern ? { opacity: 0.9 } : undefined}>
            {organizationName}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: isModern ? "rgba(255,255,255,0.2)" : theme.colors.successSoft,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: theme.radius.pill,
          }}
        >
          <Text variant="caption" color={isModern ? "onPrimary" : "success"}>
            {active ? "Active" : "Expired"}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <Text variant="display" color={fg}>
          {tier} Member
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Ionicons name="calendar-outline" size={14} color={theme.colors[sub]} />
          <Text variant="bodySmall" color={sub} style={isModern ? { opacity: 0.9 } : undefined}>
            Valid until {validUntil}
          </Text>
        </View>
      </View>
    </>
  );

  const common = {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    minHeight: 180,
    justifyContent: "space-between" as const,
  };

  if (isModern) {
    return (
      <LinearGradient
        testID={testID}
        colors={[theme.colors.primary, shade(theme.colors.primary, 0.26)] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={common}
      >
        {inner}
      </LinearGradient>
    );
  }

  if (cardStyle === CardStyle.CLASSIC) {
    return (
      <View
        testID={testID}
        style={[
          { ...common, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.primary },
          theme.shadows.sm,
        ]}
      >
        {inner}
      </View>
    );
  }

  // MINIMAL
  return (
    <View
      testID={testID}
      style={[
        { ...common, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
        theme.shadows.sm,
      ]}
    >
      {inner}
    </View>
  );
}
