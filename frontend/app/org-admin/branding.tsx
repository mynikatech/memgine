import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import {
  InMemoryOrganizationService,
  InMemoryReferenceDataService,
  OrganizationBranding,
} from "@/src/core";
import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { BrandingForm } from "@/src/ui/admin/BrandingForm";

const organizationService = new InMemoryOrganizationService();
const referenceDataService = new InMemoryReferenceDataService();

export default function OrgAdminBranding() {
  const { organization } = useBusiness();

  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  const [themeTemplates, setThemeTemplates] = useState<
    Awaited<ReturnType<typeof referenceDataService.listThemeTemplates>>
  >([]);

  const [brandingStatuses, setBrandingStatuses] = useState<
    Awaited<ReturnType<typeof referenceDataService.listBrandingStatuses>>
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
          organizationService.getOrganizationBranding(organization.id),
          referenceDataService.listThemeTemplates(),
          referenceDataService.listBrandingStatuses(),
        ]);

        if (!mounted) return;

        setBranding(organizationBranding);
        setThemeTemplates(templates);
        setBrandingStatuses(statuses);
      } catch (loadError) {
        if (!mounted) return;

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

    load();

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
        await organizationService.updateOrganizationBranding(
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
