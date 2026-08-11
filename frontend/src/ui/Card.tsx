import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";

import type { Theme } from "@/src/theme/theme";

import { Surface } from "./Surface";

type CardProps = {
  children?: ReactNode;
  padding?: keyof Theme["spacing"];
  elevation?: keyof Theme["shadows"];
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Elevated content card. */
export function Card({
  children,
  padding = "lg",
  elevation = "sm",
  bordered = true,
  style,
  testID,
}: CardProps) {
  return (
    <Surface
      testID={testID}
      level="card"
      padding={padding}
      radius="lg"
      bordered={bordered}
      elevation={elevation}
      style={style}
    >
      {children}
    </Surface>
  );
}
