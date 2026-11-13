import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";

import { services } from "@/src/core";
import {
  demoCustomerApi,
  type DemoCustomer,
  type DemoCustomerPage,
} from "@/src/data/api/demo-customer-api";
import { useTheme } from "@/src/providers";
import { Button, DataTable, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

const PAGE_SIZE = 20;

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
  const [demoPage, setDemoPage] = useState<DemoCustomerPage>({ items: [], totalCount: 0 });
  const [demoSearch, setDemoSearch] = useState("");
  const [demoOffset, setDemoOffset] = useState(0);
  const [loadingDemoCustomers, setLoadingDemoCustomers] = useState(true);
  const [demoListMessage, setDemoListMessage] = useState<string | null>(null);
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

  const loadDemoCustomers = useCallback(async (offset: number, search: string) => {
    setLoadingDemoCustomers(true);
    setDemoListMessage(null);
    try {
      const result = await demoCustomerApi.list(search, PAGE_SIZE, offset);
      if (!result.success) {
        setDemoListMessage(result.error.message);
        return;
      }
      setDemoPage(result.data);
      setDemoOffset(offset);
    } catch {
      setDemoListMessage("Unable to load DEMO customers. Please try again.");
    } finally {
      setLoadingDemoCustomers(false);
    }
  }, []);

  useEffect(() => {
    void loadDemoCustomers(0, "");
  }, [loadDemoCustomers]);

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

      const refreshed = await demoCustomerApi.lookup(customer.primaryPhone);
      if (!refreshed.success || !refreshed.data) {
        setDesignationMessage(
          refreshed.success
            ? "DEMO designation was updated, but the customer status could not be refreshed."
            : refreshed.error.message,
        );
        return;
      }
      setCustomer(refreshed.data);

      setDesignationMessage(
        refreshed.data.isDemo
          ? "Customer is now a DEMO customer."
          : "DEMO designation removed.",
      );
      void loadDemoCustomers(demoOffset, demoSearch);
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
      void loadDemoCustomers(0, "");
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
        style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
      >
        <Text variant="h2">Existing DEMO Customers</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchInput}>
            <Input
              label="Search customers"
              value={demoSearch}
              onChangeText={setDemoSearch}
              placeholder="Name, email or mobile number"
              editable={!loadingDemoCustomers}
            />
          </View>
          <Button
            label={loadingDemoCustomers ? "Loading…" : "Search"}
            variant="outline"
            onPress={() => void loadDemoCustomers(0, demoSearch)}
            disabled={loadingDemoCustomers}
          />
        </View>
        {demoListMessage ? <Text color="danger">{demoListMessage}</Text> : null}
        <DataTable
          data={demoPage.items}
          keyExtractor={(item) => item.userId}
          emptyMessage={loadingDemoCustomers ? "Loading DEMO customers…" : "No active DEMO customers found."}
          minTableWidth={860}
          actionsWidth={135}
          columns={[
            { key: "displayName", title: "Customer name", width: 180 },
            { key: "primaryPhone", title: "Mobile number", width: 150 },
            { key: "primaryEmail", title: "Email", width: 220, render: (item) => <Text variant="bodySmall">{item.primaryEmail ?? "—"}</Text> },
            { key: "otpDeliveryMode", title: "OTP delivery", width: 120 },
            { key: "isDemo", title: "DEMO status", width: 115, render: (item) => <Text variant="bodySmall" color={item.isDemo ? "success" : "textMuted"}>{item.isDemo ? "DEMO" : "Not DEMO"}</Text> },
          ]}
          actions={[{ label: "View / Manage", onPress: (item) => { setCustomer(item); setDesignationMessage(null); } }]}
        />
        <View style={styles.pagination}>
          <Text color="textMuted">{demoPage.totalCount} active DEMO customer{demoPage.totalCount === 1 ? "" : "s"}</Text>
          <View style={styles.actions}>
            <Button label="Previous" variant="outline" size="sm" onPress={() => void loadDemoCustomers(Math.max(0, demoOffset - PAGE_SIZE), demoSearch)} disabled={loadingDemoCustomers || demoOffset === 0} />
            <Button label="Next" variant="outline" size="sm" onPress={() => void loadDemoCustomers(demoOffset + PAGE_SIZE, demoSearch)} disabled={loadingDemoCustomers || demoOffset + PAGE_SIZE >= demoPage.totalCount} />
          </View>
        </View>
      </View>
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
  searchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 },
  searchInput: { flex: 1, minWidth: 240 },
  pagination: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
