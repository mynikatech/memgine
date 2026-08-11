import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { useTheme } from "@/src/business";
import { darken } from "@/src/theme/color-utils";

type MembershipCardProps = {
  organizationName: string;
  tier: string;
  validUntil: string;
  status: "Active" | "Expired";
  testID?: string;
};

export function MembershipCard({
  organizationName,
  tier,
  validUntil,
  status,
  testID,
}: MembershipCardProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  return (
    <LinearGradient
      testID={testID}
      colors={[colors.primary, darken(colors.primary, 0.22)] as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.lg, padding: spacing.md, minHeight: 150, justifyContent: "space-between" }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          style={{
            color: colors.onPrimary,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.medium,
            opacity: 0.9,
          }}
        >
          {organizationName}
        </Text>
        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.2)",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontSize: fontSize.xs, fontWeight: fontWeight.semibold }}>
            {status}
          </Text>
        </View>
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.onPrimary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold }}>
          {tier} Member
        </Text>
        <Text style={{ color: colors.onPrimary, opacity: 0.85, fontSize: fontSize.sm, marginTop: 4 }}>
          Valid until {validUntil}
        </Text>
      </View>
    </LinearGradient>
  );
}
