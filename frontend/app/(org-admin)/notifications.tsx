import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import {
  InMemoryOrganizationService,
  InMemoryReferenceDataService,
  NotificationConfiguration,
} from "@/src/core";
import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { NotificationConfigurationForm } from "@/src/ui/admin/NotificationConfigurationForm";

const organizationService = new InMemoryOrganizationService();

const referenceDataService = new InMemoryReferenceDataService();

export default function OrgAdminNotifications() {
  const { organization } = useBusiness();

  const [configuration, setConfiguration] =
    useState<NotificationConfiguration | null>(null);

  const [notificationStatuses, setNotificationStatuses] = useState<
    Awaited<ReturnType<typeof referenceDataService.listOrganizationStatuses>>
  >([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [notificationConfiguration, statuses] = await Promise.all([
          organizationService.getNotificationConfiguration(organization.id),
          referenceDataService.listOrganizationStatuses(),
        ]);

        if (!mounted) return;

        setConfiguration(notificationConfiguration);
        setNotificationStatuses(statuses);
      } catch (loadError) {
        if (!mounted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load notification configuration.",
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
          title="Loading notifications"
          message="Loading notification configuration..."
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title="Unable to load notifications"
          message={error}
        />
      </View>
    );
  }

  return (
    <NotificationConfigurationForm
      organization={organization}
      configuration={configuration}
      notificationStatuses={notificationStatuses}
      onSave={async (updatedConfiguration) => {
        await organizationService.updateNotificationConfiguration(
          organization.id,
          updatedConfiguration,
        );

        setConfiguration(updatedConfiguration);

        Alert.alert(
          "Notifications updated",
          "Your notification configuration has been saved.",
        );
      }}
    />
  );
}
