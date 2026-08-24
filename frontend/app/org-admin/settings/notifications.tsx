import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import type {
  NotificationConfiguration,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { NotificationConfigurationForm } from "@/src/ui/admin/NotificationConfigurationForm";

export default function OrgAdminNotifications() {
  const { organization } = useBusiness();

  const [configuration, setConfiguration] =
    useState<NotificationConfiguration | null>(null);

  const [notificationStatuses, setNotificationStatuses] = useState<Status[]>(
    [],
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [notificationConfiguration, statuses] = await Promise.all([
          services.organization.getNotificationConfiguration(organization.id),
          services.status.listOrganizationStatuses(),
        ]);

        if (!mounted) {
          return;
        }

        setConfiguration(notificationConfiguration);
        setNotificationStatuses(statuses);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

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

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const handleSave = async (
    updatedConfiguration: NotificationConfiguration,
  ) => {
    try {
      const saved = await services.organization.updateNotificationConfiguration(
        organization.id,
        updatedConfiguration,
      );

      setConfiguration(saved);

      Alert.alert(
        "Notifications updated",
        "Your notification configuration has been saved.",
      );
    } catch (saveError) {
      Alert.alert(
        "Unable to update notifications",
        saveError instanceof Error
          ? saveError.message
          : "Unable to save notification configuration.",
      );
    }
  };

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
      onSave={handleSave}
    />
  );
}
