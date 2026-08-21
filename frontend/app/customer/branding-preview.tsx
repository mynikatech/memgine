import { useEffect, useState } from "react";
import { View } from "react-native";

import { InMemoryOrganizationService, OrganizationBranding } from "@/src/core";
import { useBusiness } from "@/src/providers";
import { Button, Card, Text } from "@/src/ui";

const organizationService = new InMemoryOrganizationService();

export default function BrandingPreview() {
  const { organization } = useBusiness();

  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const organizationBranding =
        await organizationService.getOrganizationBranding(organization.id);

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

  const primaryColor = branding.primaryColor ?? "#0F766E";

  const secondaryColor = branding.secondaryColor ?? "#2563EB";

  const accentColor = branding.accentColor ?? "#FFFFFF";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: accentColor,
        padding: 24,
        gap: 20,
      }}
    >
      <View
        style={{
          backgroundColor: primaryColor,
          borderRadius: 20,
          padding: 24,
          gap: 8,
        }}
      >
        <Text variant="h1" color="text">
          {organization.displayName}
        </Text>

        <Text variant="body" color="text">
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
              backgroundColor: secondaryColor,
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

          <Button label="View Memberships" onPress={() => {}} />
        </View>
      </Card>
    </View>
  );
}
