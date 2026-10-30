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
  /** Optional page-heading foreground; children retain their original theme. */
  titleColor?: string;
};

export function Section({
  title,
  description,
  action,
  children,
  testID,
  titleColor,
}: SectionProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={{ gap: theme.spacing.lg }}>
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
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              {title ? (
                <Text variant="title" color="text" style={titleColor ? { color: titleColor } : undefined}>
                  {title}
                </Text>
              ) : null}
              {description ? (
                <Text variant="bodySmall" color="textSecondary" style={titleColor ? { color: titleColor } : undefined}>
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
