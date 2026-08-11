import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  testID?: string;
};

export function Badge({ label, tone = "neutral", testID }: BadgeProps) {
  const theme = useTheme();

  const map: Record<BadgeTone, { bg: string; fg: keyof typeof theme.colors }> = {
    neutral: { bg: theme.colors.surfaceAlt, fg: "textSecondary" },
    brand: { bg: theme.colors.primarySoft, fg: "primary" },
    success: { bg: theme.colors.successSoft, fg: "success" },
    warning: { bg: theme.colors.warningSoft, fg: "warning" },
    danger: { bg: theme.colors.dangerSoft, fg: "danger" },
    info: { bg: theme.colors.infoSoft, fg: "info" },
  };
  const c = map[tone];

  return (
    <View
      testID={testID}
      style={{
        alignSelf: "flex-start",
        backgroundColor: c.bg,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 4,
        borderRadius: theme.radius.pill,
      }}
    >
      <Text variant="caption" color={c.fg}>
        {label}
      </Text>
    </View>
  );
}
