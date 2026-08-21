import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import { OrganizationBranding, services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { BrandingForm } from "@/src/ui/admin/BrandingForm";

export default function OrgAdminBranding() {
  const { organization } = useBusiness();

  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  const [themeTemplates, setThemeTemplates] = useState<
    Awaited<ReturnType<typeof services.referenceData.listThemeTemplates>>
  >([]);

  const [brandingStatuses, setBrandingStatuses] = useState<
    Awaited<ReturnType<typeof services.referenceData.listBrandingStatuses>>
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [organizationBranding, templates, statuses] = await Promise.all([
          services.organization.getOrganizationBranding(organization.id),
          services.referenceData.listThemeTemplates(),
          services.referenceData.listBrandingStatuses(),
        ]);

        if (!mounted) {
          return;
        }

        setBranding(organizationBranding);
        setThemeTemplates(templates);
        setBrandingStatuses(statuses);
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
      themeTemplates={themeTemplates}
      brandingStatuses={brandingStatuses}
      onSave={async (updatedBranding: OrganizationBranding) => {
        await services.organization.updateOrganizationBranding(
          organization.id,
          updatedBranding,
        );

        setBranding(updatedBranding);

        Alert.alert(
          "Branding updated",
          "Your organization branding has been saved.",
        );
      }}
    />
  );
}
