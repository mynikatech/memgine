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

export function Section({
  title,
  description,
  action,
  children,
  testID,
}: SectionProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        gap: theme.spacing.lg,
      }}
    >
      {title || description || action ? (
        <View
          style={{
            gap: theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                flex: 1,
                gap: theme.spacing.xs,
              }}
            >
              {title ? (
                <Text variant="title" color="text">
                  {title}
                </Text>
              ) : null}

              {description ? (
                <Text variant="bodySmall" color="textSecondary">
                  {description}
                </Text>
              ) : null}
            </View>

            {action}
          </View>
        </View>
      ) : null}

      {children}
    </View>
  );
}
