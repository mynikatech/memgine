import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  fullWidth,
  testID,
}: ButtonProps) {
  const theme = useTheme();

  const palette: Record<ButtonVariant, { bg: string; fg: keyof typeof theme.colors; border: string }> = {
    primary: { bg: theme.colors.primary, fg: "onPrimary", border: theme.colors.primary },
    secondary: { bg: theme.colors.primarySoft, fg: "primary", border: theme.colors.primarySoft },
    outline: { bg: "transparent", fg: "text", border: theme.colors.borderStrong },
    ghost: { bg: "transparent", fg: "primary", border: "transparent" },
  };
  const p = palette[variant];
  const height = size === "sm" ? 40 : 48;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.lg,
          opacity: disabled ? theme.states.disabledOpacity : pressed ? theme.states.pressedOpacity : 1,
        },
        fullWidth ? ({ alignSelf: "stretch" } as ViewStyle) : null,
      ]}
    >
      <Text variant="bodyStrong" color={p.fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
