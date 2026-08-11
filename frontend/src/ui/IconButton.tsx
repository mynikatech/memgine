import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { useTheme } from "@/src/providers";
import type { ThemeColorToken } from "@/src/theme/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

type IconButtonProps = {
  icon: IoniconName;
  onPress?: () => void;
  size?: number;
  color?: ThemeColorToken;
  variant?: "plain" | "soft";
  disabled?: boolean;
  testID?: string;
};

export function IconButton({
  icon,
  onPress,
  size = 22,
  color = "text",
  variant = "plain",
  disabled,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const box = size + 20;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => ({
        width: box,
        height: box,
        borderRadius: theme.radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: variant === "soft" ? theme.colors.surfaceAlt : "transparent",
        opacity: disabled ? theme.states.disabledOpacity : pressed ? theme.states.pressedOpacity : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={theme.colors[color]} />
    </Pressable>
  );
}
