import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { useTheme } from "@/src/providers";
import type { Theme } from "@/src/theme/theme";

type SurfaceProps = {
  children?: ReactNode;
  level?: "background" | "surface" | "card";
  padding?: keyof Theme["spacing"];
  radius?: keyof Theme["radius"];
  bordered?: boolean;
  elevation?: keyof Theme["shadows"];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Base themed container. Building block for Card and other containers. */
export function Surface({
  children,
  level = "surface",
  padding = "none",
  radius = "md",
  bordered = false,
  elevation = "none",
  style,
  testID,
}: SurfaceProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.colors[level],
          padding: theme.spacing[padding],
          borderRadius: theme.radius[radius],
          borderWidth: bordered ? 1 : 0,
          borderColor: theme.colors.border,
        },
        theme.shadows[elevation],
        style,
      ]}
    >
      {children}
    </View>
  );
}
