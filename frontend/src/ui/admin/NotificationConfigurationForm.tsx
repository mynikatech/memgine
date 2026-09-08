import { useEffect, useState } from "react";

import {
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";

import type {
  NotificationConfiguration,
  Organization,
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
  readOnly: boolean;
  onChange: (value: boolean) => void;
};

function ChannelRow({
  label,
  description,
  value,
  readOnly,
  onChange,
}: ChannelRowProps) {
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
        disabled={readOnly}
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
    notificationStatuses.find(
      (status) => status.statusCode?.trim().toUpperCase() === "ACTIVE",
    )?.id ??
    notificationStatuses[0]?.id ??
    "status-active";

  const createDefaultForm = (): NotificationConfiguration =>
    configuration ??
    createEmptyConfiguration(
      organization.id,
      organization.updatedBy,
      defaultStatusId,
    );

  const [form, setForm] =
    useState<NotificationConfiguration>(createDefaultForm);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(createDefaultForm());
    setIsEditing(false);
    setSaveMessage(null);
  }, [configuration, organization.id, organization.updatedBy, defaultStatusId]);

  const update = <K extends keyof NotificationConfiguration>(
    field: K,
    value: NotificationConfiguration[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSaveMessage(null);
  };

  const handleEdit = () => {
    setSaveMessage(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setForm(createDefaultForm());
    setSaveMessage(null);
    setIsEditing(false);
  };

  const save = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      await onSave({
        ...form,
        configurationName: form.configurationName.trim(),
      });

      setIsEditing(false);
      setSaveMessage("Changes saved successfully.");
    } catch {
      // The parent displays the save error.
      // Keep the form in edit mode so the user can retry.
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
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="h1" color="text">
            Notifications
          </Text>

          <Text variant="bodySmall" color="textSecondary">
            Configure the notification channels available to your organization.
          </Text>
        </View>

        {!isEditing && <Button label="Edit" onPress={handleEdit} />}
      </View>

      {saveMessage && (
        <View style={styles.successMessage}>
          <Text variant="bodySmall" color="success">
            {saveMessage}
          </Text>
        </View>
      )}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Configuration">
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Configuration Name"
                value={form.configurationName}
                editable={isEditing}
                onChangeText={(value) => update("configurationName", value)}
                placeholder="Notification Configuration"
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Notification Status"
                value={form.notificationStatusId}
                items={notificationStatuses}
                disabled={!isEditing}
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
              readOnly={!isEditing}
              onChange={(value) => update("emailEnabled", value)}
            />

            <ChannelRow
              label="SMS Notifications"
              description="Send SMS notifications to customers."
              value={form.smsEnabled}
              readOnly={!isEditing}
              onChange={(value) => update("smsEnabled", value)}
            />

            <ChannelRow
              label="WhatsApp Notifications"
              description="Send WhatsApp messages to customers."
              value={form.whatsappEnabled}
              readOnly={!isEditing}
              onChange={(value) => update("whatsappEnabled", value)}
            />

            <ChannelRow
              label="Push Notifications"
              description="Send mobile push notifications."
              value={form.pushEnabled}
              readOnly={!isEditing}
              onChange={(value) => update("pushEnabled", value)}
            />

            <ChannelRow
              label="In-App Notifications"
              description="Show notifications inside the application."
              value={form.inAppEnabled}
              readOnly={!isEditing}
              onChange={(value) => update("inAppEnabled", value)}
            />
          </View>
        </Section>
      </Card>

      {isEditing && (
        <View style={styles.actions}>
          <Button label="Cancel" onPress={handleCancel} disabled={saving} />

          <Button
            label={saving ? "Saving..." : "Save Changes"}
            onPress={() => void save()}
            disabled={saving}
          />
        </View>
      )}
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

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 4,
  },

  successMessage: {
    paddingVertical: 4,
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
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingBottom: 24,
  },
});
