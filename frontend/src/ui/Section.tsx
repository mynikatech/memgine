import { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type SectionProps = {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
  testID?: string;
};

/** Titled content group with consistent vertical rhythm. */
export function Section({ title, action, children, testID }: SectionProps) {
  const theme = useTheme();
  return (
    <View testID={testID} style={{ gap: theme.spacing.md }}>
      {title || action ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {title ? (
            <Text variant="title" color="text">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}
