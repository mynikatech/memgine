import { useEffect, useState } from "react";
import { View } from "react-native";

import { OrganizationBranding, services } from "@/src/core";
import { useBusiness } from "@/src/providers";
import { buildTheme } from "@/src/theme/theme";
import { Button, Card, Text } from "@/src/ui";

export default function BrandingPreview() {
  const { organization } = useBusiness();

  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const organizationBranding =
        await services.organization.getOrganizationBranding(organization.id);

      if (mounted) {
        setBranding(organizationBranding);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  if (!branding) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text variant="body" color="textSecondary">
          Loading...
        </Text>
      </View>
    );
  }

  const theme = buildTheme(branding);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: 24,
        gap: 20,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 20,
          padding: 24,
          gap: 8,
        }}
      >
        <Text variant="h1" color="text" style={{ color: theme.colors.onPrimary }}>
          {organization.displayName}
        </Text>

        <Text variant="body" color="text" style={{ color: theme.colors.onPrimary }}>
          Welcome to your membership experience
        </Text>
      </View>

      <Card padding="lg" elevation="sm">
        <View style={{ gap: 12 }}>
          <Text variant="h2" color="text">
            Welcome to {branding.brandingName}
          </Text>

          <Text variant="body" color="textSecondary">
            This screen is using the organization&apos;s branding configuration.
          </Text>

          <View
            style={{
              backgroundColor: theme.colors.secondarySoft,
              borderColor: theme.colors.secondary,
              borderWidth: 1,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text variant="bodyStrong" color="text">
              Featured Membership
            </Text>

            <Text variant="bodySmall" color="text">
              Powered by the organization theme
            </Text>
          </View>

          <View
            style={{
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: theme.colors.accentSoft,
            }}
          >
            <Text variant="caption" style={{ color: theme.colors.accent }}>
              Member reward
            </Text>
          </View>

          <Button label="View Memberships" onPress={() => {}} />
        </View>
      </Card>
    </View>
  );
}
