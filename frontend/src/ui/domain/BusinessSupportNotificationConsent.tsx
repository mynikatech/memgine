import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { services } from "@/src/core";
import { useAuth, useTheme } from "@/src/providers";
import { Button, Card, Checkbox, Section, Text } from "@/src/ui";
import { supportNotificationSettingsApi, type SupportNotificationSettings } from "@/src/data/api/support-notification-settings-api";

/** Profile-wide permission; for business users the delivery channel is controlled by their organization. */
export function BusinessSupportNotificationConsent() {
  const { session } = useAuth();
  const theme = useTheme();
  const [settings, setSettings] = useState<SupportNotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<Array<{ name: string; enabled: boolean }>>([]);

  const orgs = (session?.access ?? []).filter(a => !!a.organizationId && a.roles.length > 0);
  const isPlatform = (session?.access ?? []).some(a => a.capabilities.includes("PLATFORM_ADMIN_ACCESS"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preferences, organizationResults] = await Promise.all([
        supportNotificationSettingsApi.get(),
        Promise.all(orgs.map(async org => {
          const config = await services.organization.getNotificationConfiguration(org.organizationId!);
          return { name: org.organizationName || org.organizationId!, enabled: config?.whatsappEnabled === true };
        })),
      ]);
      if (!preferences.success) throw new Error(preferences.error.message);
      setSettings(preferences.data);
      setOrgSettings(organizationResults);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load support notifications.");
    } finally {
      setLoading(false);
    }
  }, [session?.userId]);

  useEffect(() => { void load(); }, [load]);

  async function changeConsent(consent: boolean) {
    if (!settings || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supportNotificationSettingsApi.update({
        whatsappEnabled: settings.whatsappEnabled,
        emailEnabled: settings.emailEnabled,
        whatsappConsent: consent,
      });
      if (!result.success) throw new Error(result.error.message);
      setSettings(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update WhatsApp permission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Support Notifications" testID="business-support-notification-consent">
      <Card padding="md">
        <View style={{ gap: theme.spacing.md }}>
          {loading ? <Text color="textMuted">Loading notification settings…</Text> : null}
          {orgSettings.map(org => (
            <Checkbox key={org.name} value={org.enabled} disabled onValueChange={() => {}}
              label={`WhatsApp notifications — ${org.name}`}
              description="Read-only: controlled by the organization's notification configuration." />
          ))}
          {isPlatform && orgSettings.length === 0 ? (
            <Text color="textMuted">Platform WhatsApp notifications are controlled by Memgine administration.</Text>
          ) : null}
          {settings ? (
            <>
              <Checkbox value={settings.whatsappConsentGranted} disabled={busy}
                onValueChange={value => void changeConsent(value)}
                label="I consent to operational support notifications on WhatsApp"
                description="You can withdraw your permission at any time. This does not change your organization's WhatsApp configuration." />
              {!settings.whatsappConsentGranted ? (
                <Text color="textMuted">Support WhatsApp messages will not be sent to you until consent is given.</Text>
              ) : null}
            </>
          ) : null}
          {error ? <Text color="danger">{error}</Text> : null}
          {error && !settings ? <Button label="Retry" onPress={() => void load()} /> : null}
        </View>
      </Card>
    </Section>
  );
}
