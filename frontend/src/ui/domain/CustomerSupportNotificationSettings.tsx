import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/src/providers";
import { Button, Card, Checkbox, Section, Text } from "@/src/ui";
import { supportNotificationSettingsApi, type SupportNotificationSettings } from "@/src/data/api/support-notification-settings-api";

export function CustomerSupportNotificationSettings() {
  const theme = useTheme();
  const [settings, setSettings] = useState<SupportNotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supportNotificationSettingsApi.get().then(result => {
      if (!active) return;
      if (result.success) setSettings(result.data);
      else setError(result.error.message);
    });
    return () => { active = false; };
  }, []);
  async function save(change: { whatsappEnabled?: boolean; emailEnabled?: boolean; whatsappConsent?: boolean }) {
    if (!settings || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await supportNotificationSettingsApi.update({
        whatsappEnabled: change.whatsappEnabled ?? settings.whatsappEnabled,
        emailEnabled: change.emailEnabled ?? settings.emailEnabled,
        ...(change.whatsappConsent !== undefined ? { whatsappConsent: change.whatsappConsent } : {}),
      });
      if (result.success) setSettings(result.data);
      else setError(result.error.message);
    } finally { setBusy(false); }
  }
  return (
    <Section title="Support Notifications" testID="customer-support-notification-settings">
      <Card padding="md">
        <View style={{ gap: theme.spacing.md }}>
          {!settings ? <Text variant="bodySmall" color="textMuted">Loading notification preferences…</Text> : null}
          {settings ? <>
            <Checkbox value={settings.whatsappEnabled} disabled={busy} onValueChange={enabled => void save({whatsappEnabled: enabled, ...(!enabled ? {whatsappConsent: false} : {})})} label="WhatsApp notifications" description="Updates about your support requests" />
            {settings.whatsappEnabled && !settings.whatsappConsentGranted ? <>
              <Text variant="bodySmall" color="textMuted">To receive support updates on WhatsApp, please give permission. You can withdraw this anytime.</Text>
              <Button label="I agree to receive support updates on WhatsApp" disabled={busy} onPress={() => void save({ whatsappConsent: true })} />
            </> : null}
            {settings.whatsappConsentGranted ? <Button label="Withdraw WhatsApp permission" disabled={busy} onPress={() => void save({ whatsappConsent: false })} /> : null}
            <Checkbox value={settings.emailEnabled} disabled={busy || !settings.emailAvailable} onValueChange={enabled => void save({ emailEnabled: enabled })} label="Email notifications" description={settings.emailAvailable ? "Optional support ticket updates by email" : "Add an email address to enable email notifications"} />
          </> : null}
          {error ? <Text variant="bodySmall" color="textMuted">{error}</Text> : null}
          {error && !settings ? <Button label="Retry" onPress={() => {setError(null); void supportNotificationSettingsApi.get().then(result => result.success ? setSettings(result.data) : setError(result.error.message));}} /> : null}
        </View>
      </Card>
    </Section>
  );
}
