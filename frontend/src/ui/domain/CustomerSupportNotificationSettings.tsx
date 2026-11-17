import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";
import { Button, Card, Section, Text } from "@/src/ui";
import {
  supportNotificationSettingsApi,
  type SupportNotificationSettings,
} from "@/src/data/api/support-notification-settings-api";

export function CustomerSupportNotificationSettings({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const theme = useTheme();
  const [settings, setSettings] = useState<SupportNotificationSettings | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setError(null);

    void supportNotificationSettingsApi.get().then((result) => {
      if (!active) return;

      if (result.success) {
        setSettings(result.data);
      } else {
        setError(result.error.message);
      }
    });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function save(change: {
    whatsappEnabled?: boolean;
    emailEnabled?: boolean;
    whatsappConsent?: boolean;
  }) {
    if (!settings || busy) return;

    setBusy(true);
    setError(null);

    try {
      const result = await supportNotificationSettingsApi.update({
        whatsappEnabled: change.whatsappEnabled ?? settings.whatsappEnabled,
        emailEnabled: change.emailEnabled ?? settings.emailEnabled,
        ...(change.whatsappConsent !== undefined
          ? { whatsappConsent: change.whatsappConsent }
          : {}),
      });

      if (result.success) {
        setSettings(result.data);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError(
        "Notification preferences could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const Badge = ({ label, active }: { label: string; active: boolean }) => (
    <View
      style={{
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: active
          ? theme.colors.successSoft
          : theme.colors.surfaceAlt,
      }}
    >
      <Text variant="caption" color={active ? "success" : "textMuted"}>
        {label}
      </Text>
    </View>
  );

  const Action = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 5,
        opacity: disabled ? 0.5 : pressed ? theme.states.pressedOpacity : 1,
      })}
    >
      <Text
        variant="caption"
        color="primary"
        style={{ textDecorationLine: "underline" }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const StatusActions = ({
    label,
    active,
    actionLabel,
    onAction,
  }: {
    label: string;
    active: boolean;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <View
      style={{
        width: 105,
        flexShrink: 0,
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Badge label={label} active={active} />

        {actionLabel && onAction ? (
          <View style={{ paddingLeft: theme.spacing.sm }}>
            <Action label={actionLabel} onPress={onAction} disabled={busy} />
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Section
      title="Support Notifications"
      testID="customer-support-notification-settings"
    >
      <Text variant="caption" color="textMuted">
        Choose how you receive support updates.
      </Text>

      <Card padding="md">
        <View style={{ gap: theme.spacing.sm }}>
          {!settings ? (
            <Text variant="bodySmall" color="textMuted">
              Loading notification preferences…
            </Text>
          ) : null}

          {settings ? (
            <>
              {/* WHATSAPP */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.md,
                }}
              >
                <Ionicons name="logo-whatsapp" size={30} color="#16a34a" />

                <View
                  style={{
                    flex: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    gap: 2,
                  }}
                >
                  <Text variant="body" color="text">
                    WhatsApp Notifications
                  </Text>

                  <Text variant="caption" color="textMuted">
                    Receive support updates on WhatsApp.
                  </Text>

                  {settings.whatsappConsentGranted ? (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        columnGap: theme.spacing.sm,
                        rowGap: 0,
                      }}
                    >
                      <Text variant="caption" color="success">
                        WhatsApp consent granted
                      </Text>

                      <Text variant="caption" color="textMuted">
                        ·
                      </Text>

                      <Action
                        disabled={busy}
                        label="Withdraw permission"
                        onPress={() => void save({ whatsappConsent: false })}
                      />
                    </View>
                  ) : settings.whatsappEnabled ? (
                    <Text variant="caption" color="textMuted">
                      Consent required before delivery.
                    </Text>
                  ) : null}
                </View>

                <StatusActions
                  label={
                    settings.whatsappEnabled && settings.whatsappConsentGranted
                      ? "Enabled"
                      : settings.whatsappEnabled
                        ? "Consent needed"
                        : "Disabled"
                  }
                  active={
                    settings.whatsappEnabled && settings.whatsappConsentGranted
                  }
                  actionLabel={settings.whatsappEnabled ? "Disable" : "Enable"}
                  onAction={() =>
                    void save({
                      whatsappEnabled: !settings.whatsappEnabled,
                      ...(!settings.whatsappEnabled
                        ? {}
                        : { whatsappConsent: false }),
                    })
                  }
                />
              </View>

              {/* CONSENT REQUEST */}
              {settings.whatsappEnabled && !settings.whatsappConsentGranted ? (
                <Button
                  label="I agree to receive support updates on WhatsApp"
                  size="sm"
                  disabled={busy}
                  onPress={() => void save({ whatsappConsent: true })}
                />
              ) : null}

              {/* DIVIDER */}
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.colors.border,
                }}
              />

              {/* EMAIL */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.md,
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={29}
                  color={theme.colors.text}
                />

                <View
                  style={{
                    flex: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    gap: 2,
                  }}
                >
                  <Text variant="body" color="text">
                    Email Notifications
                  </Text>

                  <Text variant="caption" color="textMuted">
                    {settings.emailAvailable
                      ? "Receive support updates by email."
                      : "Add an email address through Edit Profile."}
                  </Text>
                </View>

                <StatusActions
                  label={
                    !settings.emailAvailable
                      ? "Unavailable"
                      : settings.emailEnabled
                        ? "Enabled"
                        : "Disabled"
                  }
                  active={settings.emailAvailable && settings.emailEnabled}
                  actionLabel={
                    settings.emailAvailable
                      ? settings.emailEnabled
                        ? "Disable"
                        : "Enable"
                      : undefined
                  }
                  onAction={
                    settings.emailAvailable
                      ? () =>
                          void save({
                            emailEnabled: !settings.emailEnabled,
                          })
                      : undefined
                  }
                />
              </View>
            </>
          ) : null}

          {error ? (
            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Card>
    </Section>
  );
}
