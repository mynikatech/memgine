import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { useTheme } from "@/src/business";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Card({ children, style, testID }: CardProps) {
  const { colors, radius, spacing, shadows } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.background,
          borderRadius: radius.lg,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}
