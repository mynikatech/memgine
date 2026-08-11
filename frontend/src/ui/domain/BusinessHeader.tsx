import { ReactNode } from "react";
import { View } from "react-native";

import { useBusiness } from "@/src/providers";

import { Text } from "../Text";

/**
 * BusinessHeader — branded top bar driven entirely by BusinessProvider
 * (business name + brand colour). Reused across customer screens. No business
 * value is hard-coded here.
 */
type BusinessHeaderProps = {
  subtitle?: string;
  right?: ReactNode;
  testID?: string;
};

export function BusinessHeader({ subtitle, right, testID }: BusinessHeaderProps) {
  const { configuration, theme } = useBusiness();
  const name = configuration.identity.displayName;
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="title" color="onPrimary">
          {initial}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
        <Text variant="h2" color="text">
          {name}
        </Text>
      </View>
      {right}
    </View>
  );
}
