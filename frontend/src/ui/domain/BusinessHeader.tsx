import { ReactNode } from "react";
import { BrandLogo } from "@/src/ui/BrandLogo";

import { View } from "react-native";

import { useBusiness } from "@/src/providers";

import { Text } from "../Text";

/**
 * BusinessHeader — branded top bar driven by BusinessProvider by default.
 * Organization-scoped flows can override the displayed business name without
 * mutating the global provider context.
 */
type BusinessHeaderProps = {
  subtitle?: string;
  right?: ReactNode;
  testID?: string;
  businessName?: string;
};

export function BusinessHeader({
  subtitle,
  right,
  testID,
  businessName,
}: BusinessHeaderProps) {
  const { configuration, theme } = useBusiness();

  const name = businessName ?? configuration.identity.displayName;
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
      <BrandLogo
        logoUrl={configuration.branding.logoUrl}
        monogram={initial}
        size={44}
        borderRadius={theme.radius.md}
        fit="contain"
      />

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
