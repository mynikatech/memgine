import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";

import type {
  Organization,
  ReferenceDataItem,
  Status,
} from "@/src/core";
import { services } from "@/src/core";
import {
  platformPaymentConfigurationApi,
  type PlatformPoyntIntegrationWrite,
  type PlatformPoyntPaymentConfiguration,
  type PoyntCredentialProfile,
} from "@/src/data/api/platform-poynt-payment-api";
import {
  Button,
  DataTable,
  Input,
  Modal,
  ReferenceSelect,
  Text,
} from "@/src/ui";

type IntegrationShellDraft = {
  organizationId: string;
  id: string;
  integrationName: string;
  integrationTypeId: string;
  provider: "POYNT";
  integrationStatusId: string;
  versionNo: number;
  create: boolean;
};

const paymentProviders = [{ id: "POYNT" as const, name: "Poynt" }];

export default function PlatformPaymentConfiguration() {
  const [items, setItems] = useState<PlatformPoyntPaymentConfiguration[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [integrationTypes, setIntegrationTypes] = useState<ReferenceDataItem[]>(
    [],
  );
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [selected, setSelected] =
    useState<PlatformPoyntPaymentConfiguration | null>(null);
  const [credentialProfiles, setCredentialProfiles] = useState<
    PoyntCredentialProfile[]
  >([]);
  const [shell, setShell] = useState<IntegrationShellDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const posTypes = useMemo(
    () =>
      integrationTypes.filter(
        (item) => item.code.trim().toUpperCase() === "POS",
      ),
    [integrationTypes],
  );

  const load = useCallback(async () => {
    const [result, organizationList, typeList, statusList] = await Promise.all([
      platformPaymentConfigurationApi.list(),
      services.organization.listOrganizations(),
      services.referenceData.listIntegrationTypes(),
      services.status.listIntegrationConfigurationStatuses(),
    ]);
    if (!result.success) throw new Error(result.error.message);
    setItems(result.data);
    setOrganizations(organizationList.filter((item) => !item.isDeleted));
    setIntegrationTypes(typeList);
    setStatuses(statusList.filter((item) => item.isActive));
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      Alert.alert("Unable to load payment configuration", error.message),
    );
  }, [load]);

  const openAdd = () => {
    const posType = posTypes[0];
    const draftStatus =
      statuses.find(
        (item) => item.statusCode.trim().toUpperCase() === "PENDING",
      ) ??
      statuses.find(
        (item) => item.statusCode.trim().toUpperCase() === "DRAFT",
      ) ??
      statuses[0];
    if (!posType || !draftStatus) {
      Alert.alert(
        "Unable to add integration",
        "POS integration type or integration status reference data is unavailable.",
      );
      return;
    }
    setShell({
      organizationId: "",
      id: `integration-${Date.now()}`,
      integrationName: "POS",
      integrationTypeId: posType.id,
      provider: "POYNT",
      integrationStatusId: draftStatus.id,
      versionNo: 1,
      create: true,
    });
  };

  const openEdit = (item: PlatformPoyntPaymentConfiguration) => {
    setShell({
      organizationId: item.organizationId,
      id: item.integrationConfigurationId,
      integrationName: item.integrationName,
      integrationTypeId: item.integrationTypeId,
      provider: "POYNT",
      integrationStatusId: item.integrationStatusId,
      versionNo: item.integrationVersionNo,
      create: false,
    });
  };

  const openConfigure = async (item: PlatformPoyntPaymentConfiguration) => {
    try {
      const result = await platformPaymentConfigurationApi.credentialProfiles();
      if (!result.success) throw new Error(result.error.message);
      setCredentialProfiles(result.data);
      setSelected(item);
    } catch (error) {
      Alert.alert(
        "Unable to load credential profiles",
        error instanceof Error
          ? error.message
          : "Unable to load Poynt credential profiles",
      );
    }
  };

  const saveShell = async () => {
    if (!shell || !shell.organizationId || !shell.integrationName.trim()) {
      Alert.alert(
        "Missing information",
        "Organization and Integration Name are required.",
      );
      return;
    }
    const body: PlatformPoyntIntegrationWrite = {
      id: shell.id,
      integrationName: shell.integrationName.trim(),
      integrationTypeId: shell.integrationTypeId,
      provider: shell.provider,
      integrationStatusId: shell.integrationStatusId,
      versionNo: shell.versionNo,
    };
    setSaving(true);
    try {
      const result = shell.create
        ? await platformPaymentConfigurationApi.createIntegration(
            shell.organizationId,
            body,
          )
        : await platformPaymentConfigurationApi.updateIntegration(
            shell.organizationId,
            shell.id,
            body,
          );
      if (!result.success) throw new Error(result.error.message);
      setShell(null);
      await load();
      if (shell.create && result.data.provider === "POYNT")
        await openConfigure(result.data);
    } catch (error) {
      Alert.alert(
        "Unable to save integration",
        error instanceof Error
          ? error.message
          : "Unable to save payment integration",
      );
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    if (!selected.credentialProfileId) {
      Alert.alert("Missing information", "Cloud App Credential is required.");
      return;
    }
    setSaving(true);
    try {
      const result = await platformPaymentConfigurationApi.save(
        selected.integrationConfigurationId,
        {
          applicationId: selected.applicationId ?? "",
          providerBusinessId: selected.providerBusinessId ?? "",
          providerStoreId: selected.providerStoreId,
          credentialProfileId: selected.credentialProfileId,
          merchantCurrencyCode: selected.merchantCurrencyCode ?? "CAD",
          versionNo: selected.versionNo,
        },
      );
      if (!result.success) throw new Error(result.error.message);
      setSelected(null);
      await load();
    } catch (error) {
      Alert.alert(
        "Unable to save",
        error instanceof Error
          ? error.message
          : "Unable to save Poynt configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  const test = async (item: PlatformPoyntPaymentConfiguration) => {
    const result = await platformPaymentConfigurationApi.test(
      item.integrationConfigurationId,
    );
    if (!result.success)
      return Alert.alert("Connection failed", result.error.message);
    await load();
    Alert.alert(
      "Connection test",
      result.data.connectionStatus === "VERIFIED"
        ? "Poynt authentication verified."
        : "Poynt connection verification failed.",
    );
  };

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text variant="h1">Payment Configuration</Text>
      <Text color="textMuted">
        Platform-managed payment integrations, credentials and connection
        settings.
      </Text>
      <View style={{ alignItems: "flex-start" }}>
        <Button label="+ Add Payment Integration" onPress={openAdd} />
      </View>
      <View
        style={{
          gap: 4,
          padding: 16,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 8,
        }}
      >
        <Text variant="h2">Built-in Payment Provider</Text>
        <Text>TEST</Text>
        <Text variant="bodySmall" color="textMuted">
          Available through Payment Provider Routes in LOCAL and DEV.
          Credentials, connection configuration, and an integration shell are
          not required.
        </Text>
        <Text variant="bodySmall" color="textMuted">
          Credentials: N/A · Connection: N/A
        </Text>
      </View>
      <DataTable
        data={items}
        keyExtractor={(item) => item.integrationConfigurationId}
        columns={[
          { key: "organizationName", title: "Organization", width: 190 },
          { key: "integrationName", title: "Integration", width: 150 },
          { key: "provider", title: "Provider", width: 100 },
          { key: "integrationStatus", title: "Status", width: 115 },
          { key: "credentialStatus", title: "Credentials", width: 280 },
          { key: "connectionStatus", title: "Connection", width: 125 },
        ]}
        actions={[
          { label: "Edit", onPress: openEdit },
          {
            label: "Configure",
            onPress: (item) => void openConfigure(item),
            visible: (item) => item.provider === "POYNT",
          },
          {
            label: "Test",
            onPress: (item) => void test(item),
            visible: (item) => item.provider === "POYNT",
          },
        ]}
        minTableWidth={1120}
        actionsWidth={220}
      />

      <Modal
        visible={!!shell}
        onClose={() => !saving && setShell(null)}
        title={
          shell?.create ? "Add Payment Integration" : "Edit Payment Integration"
        }
        scrollable
      >
        <View style={{ gap: 12 }}>
          <ReferenceSelect
            label="Organization"
            required
            value={shell?.organizationId ?? ""}
            items={organizations}
            onChange={(value) =>
              setShell((item) =>
                item ? { ...item, organizationId: value } : item,
              )
            }
            renderItemLabel={(item) => item.displayName || item.name}
            disabled={!shell?.create}
          />
          <Input
            label="Integration Name"
            required
            value={shell?.integrationName ?? ""}
            onChangeText={(value) =>
              setShell((item) =>
                item ? { ...item, integrationName: value } : item,
              )
            }
          />
          <ReferenceSelect
            label="Integration Type"
            required
            value={shell?.integrationTypeId ?? ""}
            items={posTypes}
            onChange={(value) =>
              setShell((item) =>
                item ? { ...item, integrationTypeId: value } : item,
              )
            }
          />
          <ReferenceSelect
            label="Provider"
            required
            value={shell?.provider ?? ""}
            items={paymentProviders}
            onChange={(value) =>
              setShell((item) =>
                item ? { ...item, provider: value as "POYNT" } : item,
              )
            }
          />
          <ReferenceSelect
            label={shell?.create ? "Initial Status" : "Status"}
            required
            value={shell?.integrationStatusId ?? ""}
            items={statuses}
            onChange={(value) =>
              setShell((item) =>
                item ? { ...item, integrationStatusId: value } : item,
              )
            }
          />
          <Button
            label={
              saving
                ? "Saving…"
                : shell?.create && shell.provider === "POYNT"
                  ? "Create and Configure"
                  : shell?.create
                    ? "Create Integration"
                    : "Save Integration"
            }
            disabled={saving}
            onPress={() => void saveShell()}
          />
        </View>
      </Modal>

      <Modal
        visible={!!selected}
        onClose={() => !saving && setSelected(null)}
        title="Configure Poynt"
        scrollable
      >
        <View style={{ gap: 12 }}>
          <Text>
            {selected?.organizationName} · {selected?.integrationName}
          </Text>
          <Input
            label="Poynt Application ID"
            value={selected?.applicationId ?? ""}
            onChangeText={(value) =>
              setSelected((item) =>
                item ? { ...item, applicationId: value } : item,
              )
            }
          />
          <Input
            label="Merchant / Business ID"
            value={selected?.providerBusinessId ?? ""}
            onChangeText={(value) =>
              setSelected((item) =>
                item ? { ...item, providerBusinessId: value } : item,
              )
            }
          />
          <Input
            label="Poynt Store ID"
            value={selected?.providerStoreId ?? ""}
            onChangeText={(value) =>
              setSelected((item) =>
                item ? { ...item, providerStoreId: value } : item,
              )
            }
          />
          {credentialProfiles.length > 0 ? (
            <ReferenceSelect
              label="Cloud App Credential"
              required
              value={selected?.credentialProfileId ?? ""}
              items={credentialProfiles}
              getItemId={(item) => item.credentialProfileId}
              renderItemLabel={(item) => item.displayName}
              onChange={(value) =>
                setSelected((item) =>
                  item ? { ...item, credentialProfileId: value } : item,
                )
              }
            />
          ) : (
            <Text variant="bodySmall" color="textMuted">
              No Poynt Cloud App credential profiles are configured.
            </Text>
          )}
          <Input
            label="Merchant Currency"
            value={selected?.merchantCurrencyCode ?? "CAD"}
            onChangeText={(value) =>
              setSelected((item) =>
                item
                  ? { ...item, merchantCurrencyCode: value.toUpperCase() }
                  : item,
              )
            }
          />
          <Text variant="bodySmall" color="textMuted">
            Cloud App credentials are assigned by Memgine platform configuration
            and are never displayed here.
          </Text>
          <Button
            label={saving ? "Saving…" : "Save"}
            disabled={saving || credentialProfiles.length === 0}
            onPress={() => void save()}
          />
        </View>
      </Modal>
    </View>
  );
}
