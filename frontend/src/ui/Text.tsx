import { Text as RNText, TextProps as RNTextProps, StyleProp, TextStyle } from "react-native";

import { useTheme } from "@/src/providers";
import type { ThemeColorToken, TypographyVariant } from "@/src/theme/theme";

type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ThemeColorToken;
  style?: StyleProp<TextStyle>;
};

export function Text({ variant = "body", color = "text", style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[theme.typography[variant], { color: theme.colors[color] }, style]} />;
}
