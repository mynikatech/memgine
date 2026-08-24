import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";

import {
  NotificationConfiguration,
  Organization,
  ReferenceDataItem,
  Status,
} from "@/src/core";
import { useTheme } from "@/src/providers";
import { Button, Card, Input, ReferenceSelect, Section, Text } from "@/src/ui";

type NotificationConfigurationFormProps = {
  organization: Organization;
  configuration: NotificationConfiguration | null;
  notificationStatuses: Status[];
  onSave: (configuration: NotificationConfiguration) => Promise<void>;
};

function createEmptyConfiguration(
  organizationId: string,
  createdBy: string,
  defaultStatusId: string,
): NotificationConfiguration {
  const now = new Date().toISOString();

  return {
    id: `notification-config-${organizationId}`,
    organizationId,
    configurationName: "Default Notifications",

    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,

    notificationStatusId: defaultStatusId,

    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,

    isDeleted: false,
    versionNo: 1,
  };
}

type ChannelRowProps = {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function ChannelRow({ label, description, value, onChange }: ChannelRowProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing.md,
      }}
    >
      <View
        style={{
          flex: 1,
          gap: theme.spacing.xs,
        }}
      >
        <Text variant="bodyStrong" color="text">
          {label}
        </Text>

        <Text variant="bodySmall" color="textSecondary">
          {description}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: theme.colors.border,
          true: theme.colors.primarySoft,
        }}
        thumbColor={value ? theme.colors.primary : theme.colors.surfaceAlt}
      />
    </View>
  );
}

export function NotificationConfigurationForm({
  organization,
  configuration,
  notificationStatuses,
  onSave,
}: NotificationConfigurationFormProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const compact = width < 760;
  const narrow = width < 520;

  const defaultStatusId =
    notificationStatuses.find((status) => status.statusCode === "ACTIVE")?.id ??
    notificationStatuses[0]?.id ??
    "status-active";

  const [form, setForm] = useState<NotificationConfiguration>(
    configuration ??
      createEmptyConfiguration(
        organization.id,
        organization.updatedBy,
        defaultStatusId,
      ),
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(
      configuration ??
        createEmptyConfiguration(
          organization.id,
          organization.updatedBy,
          defaultStatusId,
        ),
    );
  }, [configuration, organization.id, organization.updatedBy, defaultStatusId]);

  const update = <K extends keyof NotificationConfiguration>(
    field: K,
    value: NotificationConfiguration[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const save = async () => {
    setSaving(true);

    try {
      await onSave({
        ...form,
        configurationName: form.configurationName.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          padding: narrow ? theme.spacing.md : theme.spacing.xl,
        },
      ]}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1" color="text">
          Notifications
        </Text>

        <Text variant="bodySmall" color="textSecondary">
          Configure the notification channels available to your organization.
        </Text>
      </View>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Configuration">
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Configuration Name"
                value={form.configurationName}
                onChangeText={(value) => update("configurationName", value)}
                placeholder="Notification Configuration"
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Notification Status"
                value={form.notificationStatusId}
                items={notificationStatuses}
                onChange={(value) => update("notificationStatusId", value)}
                placeholder="Please select"
              />
            </View>
          </View>
        </Section>
      </Card>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Notification Channels">
          <View style={{ gap: theme.spacing.md }}>
            <ChannelRow
              label="Email Notifications"
              description="Send email notifications to customers."
              value={form.emailEnabled}
              onChange={(value) => update("emailEnabled", value)}
            />

            <ChannelRow
              label="SMS Notifications"
              description="Send SMS notifications to customers."
              value={form.smsEnabled}
              onChange={(value) => update("smsEnabled", value)}
            />

            <ChannelRow
              label="WhatsApp Notifications"
              description="Send WhatsApp messages to customers."
              value={form.whatsappEnabled}
              onChange={(value) => update("whatsappEnabled", value)}
            />

            <ChannelRow
              label="Push Notifications"
              description="Send mobile push notifications."
              value={form.pushEnabled}
              onChange={(value) => update("pushEnabled", value)}
            />

            <ChannelRow
              label="In-App Notifications"
              description="Show notifications inside the application."
              value={form.inAppEnabled}
              onChange={(value) => update("inAppEnabled", value)}
            />
          </View>
        </Section>
      </Card>

      <View style={styles.actions}>
        <Button
          label={saving ? "Saving..." : "Save Changes"}
          onPress={save}
          disabled={saving}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  fullWidth: {
    width: "100%",
  },
  halfWidth: {
    width: "48%",
  },
  actions: {
    alignItems: "flex-end",
    paddingBottom: 24,
  },
});
