import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";

import { services } from "@/src/core";
import {
  demoCustomerApi,
  type DemoCustomer,
} from "@/src/data/api/demo-customer-api";
import { useTheme } from "@/src/providers";
import { Button, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

export default function DemoCustomersScreen() {
  const theme = useTheme();
  const [countries, setCountries] = useState<
    Awaited<ReturnType<typeof services.referenceData.listCountries>>
  >([]);
  const [lookupPhone, setLookupPhone] = useState<PhoneValue>({
    countryId: "country-ca",
    callingCode: "+1",
    number: "",
  });
  const [provisionPhone, setProvisionPhone] = useState<PhoneValue>({
    countryId: "country-ca",
    callingCode: "+1",
    number: "",
  });
  const [customer, setCustomer] = useState<DemoCustomer | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [designationMessage, setDesignationMessage] = useState<string | null>(
    null,
  );
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    void services.referenceData
      .listCountries()
      .then((items) => {
        if (active) setCountries(items);
      })
      .catch(() => {
        if (active)
          setLookupMessage("Country calling codes could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  const toPhone = (value: PhoneValue) => `${value.callingCode}${value.number}`;

  const lookup = async () => {
    setLoading(true);
    setLookupMessage(null);
    setDesignationMessage(null);
    setCustomer(null);

    try {
      const result = await demoCustomerApi.lookup(toPhone(lookupPhone));

      if (!result.success) {
        setLookupMessage(result.error.message);
        return;
      }

      setCustomer(result.data);

      if (!result.data) {
        setLookupMessage(
          "No existing customer was found for this mobile number.",
        );
      }
    } catch {
      setLookupMessage("Unable to find customer. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const updateDemo = async (isDemo: boolean) => {
    if (!customer) return;

    setLoading(true);
    setDesignationMessage(null);

    try {
      const result = await demoCustomerApi.setDemo(customer.userId, isDemo);

      if (!result.success) {
        setDesignationMessage(result.error.message);
        return;
      }

      setCustomer({ ...customer, isDemo });

      setDesignationMessage(
        isDemo
          ? "Customer is now a DEMO customer."
          : "DEMO designation removed.",
      );
    } catch {
      setDesignationMessage(
        "Unable to update DEMO designation. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const confirmDemoChange = (isDemo: boolean) => {
    if (!customer || loading) return;

    const title = isDemo
      ? "Mark as DEMO customer?"
      : "Remove DEMO designation?";

    const description = isDemo
      ? "This customer can use the DEMO customer flow for authorized demonstrations and QA."
      : "This customer will no longer be designated as a DEMO customer.";

    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${description}`)) {
        void updateDemo(isDemo);
      }
      return;
    }

    Alert.alert(title, description, [
      { text: "Cancel", style: "cancel" },
      {
        text: isDemo ? "Mark as DEMO" : "Remove DEMO",
        style: isDemo ? "default" : "destructive",
        onPress: () => void updateDemo(isDemo),
      },
    ]);
  };
  const provision = async () => {
    setLoading(true);
    setProvisionMessage(null);

    try {
      const result = await demoCustomerApi.provision({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        primaryPhone: toPhone(provisionPhone),
        primaryEmail: email.trim() || undefined,
      });

      if (!result.success) {
        setProvisionMessage(result.error.message);
        return;
      }

      setCustomer(result.data);
      setDesignationMessage(null);
      setLookupPhone(provisionPhone);

      setProvisionMessage("DEMO customer provisioned successfully.");

      setFirstName("");
      setLastName("");
      setEmail("");
      setProvisionPhone({
        countryId: "country-ca",
        callingCode: "+1",
        number: "",
      });
    } catch {
      setProvisionMessage("Unable to create DEMO customer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <Text variant="h1">DEMO Customers</Text>
      <Text color="textSecondary">
        Manage test customer accounts for demonstrations, QA and App Review.
      </Text>
      <View
        style={[
          styles.card,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Text variant="h2">Find Existing Customer</Text>
        <PhoneField
          label="Customer mobile number"
          required
          value={lookupPhone}
          countries={countries}
          onChange={setLookupPhone}
          disabled={loading}
        />
        <Button
          label={loading ? "Finding customer…" : "Find Customer"}
          onPress={() => void lookup()}
          disabled={
            loading || !lookupPhone.callingCode || !lookupPhone.number.trim()
          }
        />
        {lookupMessage ? <Text color="danger">{lookupMessage}</Text> : null}
      </View>
      {customer ? (
        <View
          style={[
            styles.card,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Text variant="h2">Customer</Text>
          <Text variant="bodyStrong">{customer.displayName}</Text>
          <Text>{customer.primaryPhone}</Text>
          {customer.primaryEmail ? <Text>{customer.primaryEmail}</Text> : null}
          <Text color="textSecondary">
            DEMO designation:{" "}
            {customer.isDemo ? "DEMO customer" : "Not a DEMO customer"}
          </Text>
          <Text color="textSecondary">
            OTP preference (read-only): {customer.otpDeliveryMode}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Mark as DEMO"
              variant="primary"
              onPress={() => confirmDemoChange(true)}
              disabled={loading || customer.isDemo}
            />
            <Button
              label="Remove DEMO"
              variant="outline"
              onPress={() => confirmDemoChange(false)}
              disabled={loading || !customer.isDemo}
            />
          </View>
          {designationMessage ? (
            <Text
              color={
                designationMessage === "Customer is now a DEMO customer." ||
                designationMessage === "DEMO designation removed."
                  ? "success"
                  : "danger"
              }
            >
              {designationMessage}
            </Text>
          ) : null}
          <Text color="textMuted">
            DEMO customers may only have customer access to DEMO organizations.
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.card,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Text variant="h2">Create DEMO Customer</Text>
        <Input
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <Input label="Last name" value={lastName} onChangeText={setLastName} />
        <PhoneField
          label="Mobile number"
          required
          value={provisionPhone}
          countries={countries}
          onChange={setProvisionPhone}
          disabled={loading}
        />
        <Input
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
        <Button
          label={loading ? "Creating DEMO customer…" : "Create DEMO Customer"}
          onPress={() => void provision()}
          disabled={
            loading ||
            !provisionPhone.callingCode ||
            !provisionPhone.number.trim() ||
            !firstName.trim() ||
            !lastName.trim()
          }
        />
        {provisionMessage ? (
          <Text
            color={
              provisionMessage === "DEMO customer provisioned successfully."
                ? "success"
                : "danger"
            }
          >
            {provisionMessage}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 16, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    maxWidth: 680,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
