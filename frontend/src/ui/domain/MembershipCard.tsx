import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";

import { CardStyle } from "@/src/core";
import { useTheme } from "@/src/providers";
import { shade } from "@/src/theme/color-utils";

import { Badge } from "../Badge";
import { Text } from "../Text";

/**
 * MembershipCard — reusable PRESENTATION of a customer's subscription card.
 * Honours the template's supported card styles. No purchase/QR/redemption
 * behaviour; presentation only.
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

  const Body = (
    <View style={{ minHeight: 150, justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text
          variant="bodySmall"
          color={cardStyle === CardStyle.MODERN ? "onPrimary" : "textSecondary"}
        >
          {organizationName}
        </Text>
        <Badge label={active ? "Active" : "Expired"} tone={active ? "success" : "neutral"} />
      </View>
      <View>
        <Text
          variant="h1"
          color={cardStyle === CardStyle.MODERN ? "onPrimary" : "text"}
        >
          {tier} Member
        </Text>
        <Text
          variant="bodySmall"
          color={cardStyle === CardStyle.MODERN ? "onPrimary" : "textMuted"}
          style={cardStyle === CardStyle.MODERN ? { opacity: 0.85 } : undefined}
        >
          Valid until {validUntil}
        </Text>
      </View>
    </View>
  );

  if (cardStyle === CardStyle.MODERN) {
    return (
      <LinearGradient
        testID={testID}
        colors={[theme.colors.primary, shade(theme.colors.primary, 0.24)] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: theme.radius.lg, padding: theme.spacing.lg }}
      >
        {Body}
      </LinearGradient>
    );
  }

  if (cardStyle === CardStyle.CLASSIC) {
    return (
      <View
        testID={testID}
        style={[
          {
            backgroundColor: theme.colors.primarySoft,
            borderRadius: theme.radius.lg,
            padding: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.primary,
          },
          theme.shadows.sm,
        ]}
      >
        {Body}
      </View>
    );
  }

  // MINIMAL
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {Body}
    </View>
  );
}
