import { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type HeaderProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  testID?: string;
};

/** Reusable content header (screen-agnostic). */
export function Header({ title, subtitle, left, right, testID }: HeaderProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="h2" color="text">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
