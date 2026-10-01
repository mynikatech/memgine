import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type {
  CommercePaymentProviderRoute,
  CommercePaymentProviderRouteWrite,
  IntegrationConfiguration,
  Store,
} from "@/src/core";
import { useTheme } from "@/src/providers";

import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

type Props = {
  route: CommercePaymentProviderRoute | null;
  stores: Store[];
  integrations: IntegrationConfiguration[];
  mode: "add" | "edit" | "view";
  allowTest: boolean;
  onSave: (route: CommercePaymentProviderRouteWrite) => void;
  onCancel: () => void;
};

type FormState = CommercePaymentProviderRouteWrite;

const emptyRoute: FormState = {
  storeId: null,
  sourceChannel: "COUNTER",
  providerCode: "",
  integrationConfigurationId: null,
  enabled: true,
  versionNo: 1,
};

export function CommercePaymentProviderRouteForm({
  route,
  stores,
  integrations,
  mode,
  allowTest,
  onSave,
  onCancel,
}: Props) {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(emptyRoute);

  useEffect(() => {
    setForm(route ? {
      storeId: route.storeId ?? null,
      sourceChannel: route.sourceChannel,
      providerCode: route.providerCode,
      integrationConfigurationId: route.integrationConfigurationId ?? null,
      enabled: route.enabled,
      versionNo: route.versionNo,
    } : emptyRoute);
  }, [route]);

  const readOnly = mode === "view";
  const providerOptions = useMemo(() => {
    const configured = integrations
      .filter((integration) => !integration.isDeleted)
      .map((integration) => integration.provider.trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set(allowTest ? [...configured, "TEST"] : configured));
  }, [allowTest, integrations]);

  const matchingIntegrations = useMemo(
    () => integrations.filter((integration) =>
      !integration.isDeleted &&
      integration.provider.trim().toUpperCase() === form.providerCode,
    ),
    [form.providerCode, integrations],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (!readOnly) setForm((current) => ({ ...current, [key]: value }));
  };

  const selectProvider = (providerCode: string) => {
    if (readOnly) return;
    update("providerCode", providerCode);
    update("integrationConfigurationId", null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <View style={styles.field}>
          <ReferenceSelect
            label="Source Channel"
            value={form.sourceChannel}
            items={["COUNTER", "CUSTOMER"]}
            getItemId={(item) => item}
            renderItemLabel={(item) => item === "COUNTER" ? "Counter" : "Customer"}
            onChange={(value) => update("sourceChannel", value as FormState["sourceChannel"])}
            disabled={readOnly}
          />
        </View>
        <View style={styles.field}>
          <ReferenceSelect
            label="Store"
            value={form.storeId ?? ""}
            items={stores.filter((store) => !store.isDeleted)}
            getItemId={(store) => store.id}
            renderItemLabel={(store) => `${store.name} (${store.storeCode})`}
            placeholder="Organization default"
            allowClear
            onChange={(value) => update("storeId", value || null)}
            disabled={readOnly}
          />
        </View>
        <View style={styles.field}>
          <ReferenceSelect
            label="Provider"
            value={form.providerCode}
            items={providerOptions}
            getItemId={(provider) => provider}
            renderItemLabel={(provider) => provider}
            placeholder="Select provider"
            onChange={selectProvider}
            disabled={readOnly}
          />
        </View>
        <View style={styles.field}>
          <ReferenceSelect
            label="Integration Configuration"
            value={form.integrationConfigurationId ?? ""}
            items={matchingIntegrations}
            getItemId={(integration) => integration.id}
            renderItemLabel={(integration) => integration.integrationName}
            placeholder={form.providerCode === "TEST" ? "Not used for TEST" : "Select integration"}
            allowClear={form.providerCode !== "TEST"}
            onChange={(value) => update("integrationConfigurationId", value || null)}
            disabled={readOnly || form.providerCode === "TEST" || !form.providerCode}
          />
        </View>
      </View>

      <Pressable
        disabled={readOnly}
        onPress={() => update("enabled", !form.enabled)}
        style={({ pressed }) => [
          styles.enabled,
          {
            backgroundColor: form.enabled ? theme.colors.primarySoft : theme.colors.surfaceAlt,
            opacity: readOnly ? 0.7 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text variant="body" color="text">{form.enabled ? "Enabled" : "Disabled"}</Text>
      </Pressable>

      {!readOnly ? (
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.secondaryButton}>
            <Text variant="body" color="text">Cancel</Text>
          </Pressable>
          <Pressable onPress={() => onSave(form)} style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}>
            <Text variant="body" color="background">Save Route</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { width: "48%", minWidth: 220 },
  enabled: { minHeight: 44, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center", alignSelf: "flex-start" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  primaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 8, justifyContent: "center" },
  secondaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 8, justifyContent: "center", backgroundColor: "#E5E7EB" },
});
