import { useEffect, useState } from "react";

import { Alert, View } from "react-native";

import { OrganizationBranding, services } from "@/src/core";

import { useBusiness } from "@/src/providers";

import { StateView } from "@/src/ui";

import { BrandingForm } from "@/src/ui/admin/BrandingForm";

export default function OrgAdminBranding() {
  const { organization } = useBusiness();

  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  const [templates, setTemplates] = useState<
    Awaited<ReturnType<typeof services.template.listTemplates>>
  >([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [organizationBranding, availableTemplates] = await Promise.all([
          services.organization.getOrganizationBranding(organization.id),
          services.template.listTemplates(),
        ]);

        if (!mounted) {
          return;
        }

        setBranding(organizationBranding);
        setTemplates(availableTemplates);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load branding information.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="loading"
          title="Loading branding"
          message="Loading organization branding..."
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title="Unable to load branding"
          message={error}
        />
      </View>
    );
  }

  return (
    <BrandingForm
      organization={organization}
      branding={branding}
      templates={templates}
      onSave={async (updatedBranding) => {
        try {
          const savedBranding =
            await services.organization.updateOrganizationBranding(
              organization.id,
              updatedBranding,
            );

          setBranding(savedBranding);

          Alert.alert(
            "Branding updated",
            "Your organization branding has been saved.",
          );
        } catch (saveError) {
          Alert.alert(
            "Unable to save branding",
            saveError instanceof Error
              ? saveError.message
              : "Unable to save organization branding.",
          );

          throw saveError;
        }
      }}
    />
  );
}
