import { useEffect, useState } from "react";
import { View } from "react-native";

import type { Customer } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useTranslation } from "@/src/providers";
import { Card, Header, ListRow, Modal, Section, Text } from "@/src/ui";

const CUSTOMER_ID = "cust-1";

export default function Profile() {
  const { theme } = useBusiness();
  const { t, locale, currency, timezone } = useTranslation();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);

  useEffect(() => {
    mockServices.customer.getCustomer(CUSTOMER_ID).then(setCustomer);
  }, []);

  const initial = (customer?.fullName ?? "?").trim().charAt(0).toUpperCase();

  return (
    <Screen
      testID="customer-profile-screen"
      edges={["top"]}
      header={<Header title={t("profile.title")} subtitle={t("profile.subtitle")} testID="profile-header" />}
    >
      <Card padding="lg" testID="profile-identity">
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
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
              {customer?.fullName ?? "—"}
            </Text>
            {customer?.email ? (
              <Text variant="bodySmall" color="textMuted">
                {customer.email}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Section title={t("profile.preferences")} testID="profile-preferences">
        <Card padding="md">
          <ListRow label={t("profile.language")} value={locale} icon="language-outline" showChevron={false} testID="profile-language" />
          <ListRow
            label={t("profile.region")}
            value={`${currency} · ${timezone}`}
            icon="globe-outline"
            showChevron={false}
            testID="profile-region"
          />
        </Card>
      </Section>

      <Section title={t("profile.account")} testID="profile-account">
        <Card padding="md">
          <ListRow
            label={t("profile.switchBusiness")}
            icon="swap-horizontal-outline"
            onPress={() => setSwitchOpen(true)}
            testID="profile-switch-business"
          />
          <ListRow label={t("profile.about")} icon="information-circle-outline" onPress={() => {}} testID="profile-about" />
        </Card>
      </Section>

      <Modal
        visible={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title={t("profile.switchBusinessTitle")}
        testID="profile-switch-modal"
      >
        <Text variant="body" color="textSecondary">
          {t("profile.switchBusinessBody")}
        </Text>
      </Modal>
    </Screen>
  );
}
