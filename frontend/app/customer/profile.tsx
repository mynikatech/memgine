import { View } from "react-native";

import { Screen } from "@/src/layout";
import { useAuth, useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { Card, Header, ListRow, Section, StateView, Text } from "@/src/ui";

export default function Profile() {
  const { theme } = useBusiness();
  const { t, locale, currency, timezone } = useTranslation();
  const { customerId, profiles, customersLoading, customersError, refreshCustomers } = useCustomerContext();
  const { session, logout } = useAuth();
  const relationships = profiles.filter((row) => row.userId === customerId);
  const customer = relationships[0];
  const name = customer?.displayName?.trim() || session?.displayName?.trim() ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim();
  const initial = (name || "?").charAt(0).toUpperCase();

  const languageLabel = locale.toLowerCase().startsWith("en")
    ? t("profile.languageEnglish")
    : locale;

  const regionLabel = `${currency} · ${timezone}`;

  return (
    <Screen
      testID="customer-profile-screen"
      edges={["top"]}
      header={
        <Header
          title={t("profile.title")}
          subtitle={t("profile.subtitle")}
          testID="profile-header"
        />
      }
    >
      {customersLoading ? <StateView kind="loading" message={t("common.loading")} /> : null}
      {customersError ? <StateView kind="error" title={t("common.error")}
        message={customersError} actionLabel={t("common.retry")}
        onAction={() => void refreshCustomers()} /> : null}
      <Card padding="lg" testID="profile-identity">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="h2" color="primary">
              {initial}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text variant="title" color="text">
              {name || "—"}
            </Text>

            {customer?.primaryEmail ? (
              <Text variant="bodySmall" color="textMuted">
                {customer.primaryEmail}
              </Text>
            ) : null}
            {customer?.primaryPhone ? (
              <Text variant="bodySmall" color="textMuted">{customer.primaryPhone}</Text>
            ) : null}
          </View>
        </View>
      </Card>

      {relationships.length > 0 ? (
        <Section title="Businesses" testID="profile-businesses">
          <Card padding="md">
            {relationships.map((row) => (
              <ListRow key={row.organizationUserId} label={row.organizationName}
                value={row.relationshipStatusName} showChevron={false} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t("profile.preferences")} testID="profile-preferences">
        <Card padding="md">
          <ListRow
            label={t("profile.language")}
            value={languageLabel}
            icon="language-outline"
            showChevron={false}
            testID="profile-language"
          />

          <ListRow
            label={t("profile.region")}
            value={regionLabel}
            icon="globe-outline"
            showChevron={false}
            testID="profile-region"
          />
        </Card>
      </Section>

      <Section title={t("profile.account")} testID="profile-account">
        <Card padding="md">
          <ListRow
            label={t("profile.about")}
            icon="information-circle-outline"
            onPress={() => {}}
            testID="profile-about"
          />

          <ListRow label="Sign out" icon="log-out-outline" onPress={() => { void logout(); }}
            testID="profile-sign-out" />
        </Card>
      </Section>
    </Screen>
  );
}
