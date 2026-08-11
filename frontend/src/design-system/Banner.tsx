import { ReactNode } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/src/business";

type BannerProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  testID?: string;
};

export function Banner({ title, subtitle, right, testID }: BannerProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: colors.primarySoft,
        borderRadius: radius.lg,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.text, fontSize: fontSize.sm, marginTop: 4 }}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
