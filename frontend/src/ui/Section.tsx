import { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type SectionProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  testID?: string;
};

/** Titled content group with consistent vertical rhythm. */
export function Section({
  title,
  description,
  action,
  children,
  testID,
}: SectionProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={{ gap: theme.spacing.md }}>
      {title || description || action ? (
        <View
          style={{
            gap: theme.spacing.xs,
          }}
        >
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

          {description ? (
            <Text variant="bodySmall" color="textSecondary">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}

      {children}
    </View>
  );
}
