import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { useTheme } from "@/src/business";

export type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  fullWidth,
  testID,
}: ButtonProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();

  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    ghost: { bg: "transparent", fg: colors.primary, border: colors.border },
  }[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        fullWidth ? ({ alignSelf: "stretch" } as ViewStyle) : null,
      ]}
    >
      <Text style={{ color: palette.fg, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
