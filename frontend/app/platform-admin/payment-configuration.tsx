import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";

import type { Organization, ReferenceDataItem, Status } from "@/src/core";
import { services } from "@/src/core";
import {
  platformPaymentConfigurationApi,
  type PlatformPoyntIntegrationWrite,
  type PlatformPoyntPaymentConfiguration,
  type PoyntCredentialProfile,
  type PoyntApplePayConfiguration,
} from "@/src/data/api/platform-poynt-payment-api";
import {
  Button,
  DataTable,
  Input,
  Modal,
  ReferenceSelect,
  Text,
} from "@/src/ui";

type ShellDraft = {
  organizationId: string;
  id: string;
  integrationName: string;
  integrationTypeId: string;
  provider: "POYNT";
  integrationStatusId: string;
  versionNo: number;
};
type NewDraft = Omit<ShellDraft, "id" | "versionNo">;
type AddPanel = "counter" | "payment" | null;
const providers = [{ id: "POYNT" as const, name: "Poynt" }];

// This is a narrow frontend representation of the currently registered Poynt adapter capabilities.
const capability = (provider: string) =>
  provider.toUpperCase() === "POYNT"
    ? "Product Catalog · Counter Payment · Customer Payment"
    : "Unavailable";

export default function PlatformPaymentConfiguration() {
  const [items, setItems] = useState<PlatformPoyntPaymentConfiguration[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [types, setTypes] = useState<ReferenceDataItem[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [selected, setSelected] =
    useState<PlatformPoyntPaymentConfiguration | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanel>(null);
  const [profiles, setProfiles] = useState<PoyntCredentialProfile[]>([]);
  const [shell, setShell] = useState<ShellDraft | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [draft, setDraft] = useState<NewDraft>({
    organizationId: "",
    integrationName: "POS",
    integrationTypeId: "",
    provider: "POYNT",
    integrationStatusId: "",
  });
  const [saving, setSaving] = useState(false);
  const [applePayOpen, setApplePayOpen] = useState(false);
  const [applePay, setApplePay] = useState<PoyntApplePayConfiguration | null>(
    null,
  );
  const [applePayBusy, setApplePayBusy] = useState(false);

  const posTypes = useMemo(
    () => types.filter((item) => item.code.trim().toUpperCase() === "POS"),
    [types],
  );
  const initialStatus = useMemo(
    () =>
      statuses.find(
        (item) => item.statusCode.trim().toUpperCase() === "PENDING",
      ) ??
      statuses.find(
        (item) => item.statusCode.trim().toUpperCase() === "DRAFT",
      ) ??
      statuses[0],
    [statuses],
  );
  const connections = useMemo(
    () =>
      items.filter(
        (item) =>
          item.organizationId === selectedOrganizationId &&
          item.provider.toUpperCase() === "POYNT",
      ),
    [items, selectedOrganizationId],
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
    setTypes(typeList);
    setStatuses(statusList.filter((item) => item.isActive));
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      Alert.alert(
        "Unable to load integrations",
        error instanceof Error ? error.message : "Unable to load integrations",
      ),
    );
  }, [load]);
  useEffect(() => {
    setDraft((current) => ({
      ...current,
      integrationTypeId: current.integrationTypeId || posTypes[0]?.id || "",
      integrationStatusId:
        current.integrationStatusId || initialStatus?.id || "",
    }));
  }, [initialStatus?.id, posTypes]);

  const selectOrganization = (organizationId: string) => {
    setSelectedOrganizationId(organizationId);
    setDraft((current) => ({ ...current, organizationId }));
  };

  const openAddPanel = (panel: Exclude<AddPanel, null>) => {
    setSelected(null);
    setAddPanel(panel);
  };

  const configure = async (item: PlatformPoyntPaymentConfiguration) => {
    setAddPanel(null);
    if (item.provider.toUpperCase() !== "POYNT") {
      setSelected(item);
      return;
    }
    try {
      const result = await platformPaymentConfigurationApi.credentialProfiles();
      if (!result.success) throw new Error(result.error.message);
      setProfiles(result.data);
      setSelected({ ...item });
      setApplePayOpen(false);
      setApplePay(null);
    } catch (error) {
      Alert.alert(
        "Unable to load credential profiles",
        error instanceof Error
          ? error.message
          : "Unable to load Poynt credential profiles",
      );
    }
  };

  const add = async () => {
    if (
      !draft.organizationId ||
      !draft.integrationName.trim() ||
      !draft.integrationTypeId ||
      !draft.integrationStatusId
    ) {
      Alert.alert(
        "Missing information",
        "Organization, Integration Name, Type, and Provider are required.",
      );
      return;
    }
    setSaving(true);
    try {
      const result = await platformPaymentConfigurationApi.createIntegration(
        draft.organizationId,
        {
          id: `integration-${Date.now()}`,
          integrationName: draft.integrationName.trim(),
          integrationTypeId: draft.integrationTypeId,
          provider: draft.provider,
          integrationStatusId: draft.integrationStatusId,
          versionNo: 1,
        },
      );
      if (!result.success) throw new Error(result.error.message);
      await load();
      await configure(result.data);
    } catch (error) {
      Alert.alert(
        "Unable to add integration",
        error instanceof Error ? error.message : "Unable to add integration",
      );
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: PlatformPoyntPaymentConfiguration) => {
    setAddPanel(null);
    setSelected(null);
    setShell({
      organizationId: item.organizationId,
      id: item.integrationConfigurationId,
      integrationName: item.integrationName,
      integrationTypeId: item.integrationTypeId,
      provider: "POYNT",
      integrationStatusId: item.integrationStatusId,
      versionNo: item.integrationVersionNo,
    });
  };
  const saveShell = async () => {
    if (!shell || !shell.integrationName.trim()) return;
    setSaving(true);
    try {
      const body: PlatformPoyntIntegrationWrite = {
        id: shell.id,
        integrationName: shell.integrationName.trim(),
        integrationTypeId: shell.integrationTypeId,
        provider: shell.provider,
        integrationStatusId: shell.integrationStatusId,
        versionNo: shell.versionNo,
      };
      const result = await platformPaymentConfigurationApi.updateIntegration(
        shell.organizationId,
        shell.id,
        body,
      );
      if (!result.success) throw new Error(result.error.message);
      setShell(null);
      await load();
    } catch (error) {
      Alert.alert(
        "Unable to save integration",
        error instanceof Error ? error.message : "Unable to save integration",
      );
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!selected || selected.provider.toUpperCase() !== "POYNT") return;
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

  const loadApplePay = async () => {
    if (!selected) return;
    setApplePayBusy(true);
    try {
      const result = await platformPaymentConfigurationApi.applePay(
        selected.integrationConfigurationId,
      );
      if (!result.success) throw new Error(result.error.message);
      setApplePay(result.data);
      setApplePayOpen(true);
    } catch (error) {
      Alert.alert(
        "Apple Pay configuration unavailable",
        error instanceof Error
          ? error.message
          : "Unable to load Apple Pay configuration",
      );
    } finally {
      setApplePayBusy(false);
    }
  };

  const runApplePay = async (
    label: string,
    action: (id: string) => Promise<any>,
  ) => {
    if (!selected) return;
    setApplePayBusy(true);
    try {
      const result = await action(selected.integrationConfigurationId);
      if (!result.success)
        throw new Error(
          result.error?.message ?? `Unable to ${label.toLowerCase()}`,
        );
      const refreshed = await platformPaymentConfigurationApi.applePay(
        selected.integrationConfigurationId,
      );
      if (!refreshed.success) throw new Error(refreshed.error.message);
      setApplePay(refreshed.data);
    } catch (error) {
      Alert.alert(
        `${label} unavailable`,
        error instanceof Error
          ? error.message
          : `Unable to ${label.toLowerCase()}`,
      );
    } finally {
      setApplePayBusy(false);
    }
  };

  const confirmApplePay = (
    title: string,
    message: string,
    action: () => void,
  ) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) {
        action();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: action,
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator
    >
      <Text variant="h1">Integrations</Text>
      <Text color="textMuted">
        Platform-managed catalog and payment connections, credentials, and
        connection settings.
      </Text>

      <View style={section}>
        <Text variant="h2">Configured Integrations</Text>
        <DataTable
          data={items}
          keyExtractor={(item) => item.integrationConfigurationId}
          columns={[
            { key: "organizationName", title: "Organization", width: 190 },
            { key: "integrationName", title: "Integration", width: 150 },
            { key: "provider", title: "Provider", width: 100 },
            {
              key: "capability",
              title: "Capability",
              width: 260,
              render: (item) => (
                <Text variant="bodySmall">{capability(item.provider)}</Text>
              ),
            },
            { key: "integrationStatus", title: "Status", width: 115 },
            { key: "credentialStatus", title: "Credentials", width: 170 },
            { key: "connectionStatus", title: "Connection", width: 125 },
          ]}
          actions={[
            { label: "Edit", onPress: edit },
            {
              label: "Configure",
              onPress: (item) => void configure(item),
              visible: (item) => item.provider.toUpperCase() === "POYNT",
            },
            {
              label: "Test",
              onPress: (item) => void test(item),
              visible: (item) => item.provider.toUpperCase() === "POYNT",
            },
          ]}
          minTableWidth={1380}
          actionsWidth={220}
        />
      </View>

      <View style={section}>
        <Text variant="h2">Counter / Product Catalog Integration</Text>
        {addPanel !== "counter" ? (
          <Button
            label="+ Add Counter / Product Catalog Integration"
            disabled={saving || !!selected}
            onPress={() => openAddPanel("counter")}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <ReferenceSelect
              label="Integration Type"
              required
              value={draft.integrationTypeId}
              items={posTypes}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  integrationTypeId: value,
                }))
              }
            />
            <ReferenceSelect
              label="Provider"
              required
              value={draft.provider}
              items={providers}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  provider: value as "POYNT",
                }))
              }
            />
            <Input
              label="Integration Name"
              required
              value={draft.integrationName}
              placeholder="POS or POS-TestLab"
              onChangeText={(value) =>
                setDraft((current) => ({ ...current, integrationName: value }))
              }
            />
            <ReferenceSelect
              label="Organization"
              required
              value={draft.organizationId}
              items={organizations}
              renderItemLabel={(item) => item.displayName || item.name}
              onChange={selectOrganization}
            />
            <View style={actions}>
              <Button
                label="Cancel"
                disabled={saving}
                onPress={() => setAddPanel(null)}
              />
              <Button
                label={saving ? "Adding…" : "Add Integration"}
                disabled={saving}
                onPress={() => void add()}
              />
            </View>
          </View>
        )}
      </View>

      <View style={section}>
        <Text variant="h2">Payment Provider Integration</Text>
        {addPanel !== "payment" ? (
          <Button
            label="+ Add Payment Provider Integration"
            disabled={saving || !!selected}
            onPress={() => openAddPanel("payment")}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <ReferenceSelect
              label="Provider"
              value="POYNT"
              items={providers}
              onChange={() => {}}
              disabled
            />
            <ReferenceSelect
              label="Organization"
              required
              value={selectedOrganizationId}
              items={organizations}
              renderItemLabel={(item) => item.displayName || item.name}
              onChange={selectOrganization}
            />
            {!selectedOrganizationId ? (
              <Text color="textMuted">
                Select an organization to view its available Poynt connections.
              </Text>
            ) : connections.length === 0 ? (
              <Text color="textMuted">
                No eligible Poynt connection is configured for this
                organization. Configure a POS/Poynt connection above first.
              </Text>
            ) : (
              <DataTable
                data={connections}
                keyExtractor={(item) => item.integrationConfigurationId}
                columns={[
                  { key: "integrationName", title: "Integration", width: 180 },
                  { key: "integrationStatus", title: "Status", width: 130 },
                  { key: "connectionStatus", title: "Connection", width: 130 },
                ]}
                actions={[
                  {
                    label: "Configure",
                    onPress: (item) => void configure(item),
                  },
                ]}
                minTableWidth={620}
                actionsWidth={130}
              />
            )}
            <Button
              label="Cancel"
              disabled={saving}
              onPress={() => setAddPanel(null)}
            />
          </View>
        )}
      </View>

      {selected ? (
        <View style={section}>
          <Text variant="h2">Provider-Specific Configuration</Text>
          {selected.provider.toUpperCase() !== "POYNT" ? (
            <Text color="textMuted">
              Configuration for provider {selected.provider} is not supported.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              <Text>
                {selected.organizationName} · {selected.integrationName}
              </Text>
              <Text variant="bodySmall" color="textMuted">
                Configuration version: {selected.versionNo} · Connection:{" "}
                {selected.connectionStatus}
              </Text>
              <Input
                label="Poynt Application ID"
                value={selected.applicationId ?? ""}
                onChangeText={(value) =>
                  setSelected((item) =>
                    item ? { ...item, applicationId: value } : item,
                  )
                }
              />
              <Input
                label="Merchant / Business ID"
                value={selected.providerBusinessId ?? ""}
                onChangeText={(value) =>
                  setSelected((item) =>
                    item ? { ...item, providerBusinessId: value } : item,
                  )
                }
              />
              <Input
                label="Poynt Store ID"
                value={selected.providerStoreId ?? ""}
                onChangeText={(value) =>
                  setSelected((item) =>
                    item ? { ...item, providerStoreId: value } : item,
                  )
                }
              />
              {profiles.length > 0 ? (
                <ReferenceSelect
                  label="Cloud App Credential"
                  required
                  value={selected.credentialProfileId ?? ""}
                  items={profiles}
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
                value={selected.merchantCurrencyCode ?? "CAD"}
                onChangeText={(value) =>
                  setSelected((item) =>
                    item
                      ? { ...item, merchantCurrencyCode: value.toUpperCase() }
                      : item,
                  )
                }
              />
              <View style={applePaySection}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Text variant="h3">Apple Pay Configuration</Text>
                    <Text variant="bodySmall" color="textMuted">
                      Apple Pay is a capability of this selected Poynt
                      integration.
                    </Text>
                  </View>
                  <Button
                    label={
                      applePayOpen ? "Hide Apple Pay" : "Configure Apple Pay"
                    }
                    disabled={
                      saving ||
                      applePayBusy ||
                      !selected.providerBusinessId?.trim()
                    }
                    onPress={() =>
                      applePayOpen
                        ? setApplePayOpen(false)
                        : void loadApplePay()
                    }
                  />
                </View>
                {applePayOpen ? (
                  <View style={{ gap: 12 }}>
                    {!applePay ? (
                      <Text color="textMuted">
                        Loading Apple Pay readiness…
                      </Text>
                    ) : (
                      <>
                        <View style={applePayGrid}>
                          <ApplePayField
                            label="Organization"
                            value={applePay.organizationName}
                          />
                          <ApplePayField
                            label="Poynt integration"
                            value={selected.integrationName}
                          />
                          <ApplePayField
                            label="Business ID"
                            value={applePay.businessId}
                          />
                          <ApplePayField
                            label="Poynt environment"
                            value={applePay.providerEnvironment}
                          />
                          <ApplePayField
                            label="Checkout hostname"
                            value={applePay.checkoutHostname}
                          />
                          <ApplePayField
                            label="Effective availability"
                            value={applePay.effectiveAvailability}
                          />
                          <ApplePayField
                            label="Association file"
                            value={
                              applePay.artifact
                                ? applePay.artifact.status
                                : "Not retrieved"
                            }
                          />
                          <ApplePayField
                            label="SHA-256"
                            value={applePay.artifact?.sha256 ?? "Unavailable"}
                          />
                          <ApplePayField
                            label="Last retrieved"
                            value={formatDate(applePay.artifact?.retrievedAt)}
                          />
                          <ApplePayField
                            label="Public hosting"
                            value={applePay.readiness.associationStatus}
                          />
                          <ApplePayField
                            label="Merchant registration"
                            value={applePay.readiness.status}
                          />
                          <ApplePayField
                            label="Registered domain"
                            value={
                              applePay.readiness.configuredDomainRegistered ===
                              true
                                ? applePay.checkoutHostname
                                : "Not confirmed"
                            }
                          />
                          <ApplePayField
                            label="Last verification"
                            value={formatDate(
                              applePay.registrationLastVerifiedAt,
                            )}
                          />
                        </View>
                        <Text variant="bodySmall" color="textMuted">
                          Publishing stages the approved file for the controlled
                          deployment installer. It does not run shell commands
                          or enable Apple Pay automatically.
                        </Text>
                        <View style={actions}>
                          <Button
                            label="Retrieve / Reuse Association File"
                            disabled={
                              applePayBusy ||
                              !applePay.artifactStorageConfigured
                            }
                            onPress={() =>
                              void runApplePay(
                                "Retrieve association file",
                                platformPaymentConfigurationApi.retrieveApplePayAssociation,
                              )
                            }
                          />
                          <Button
                            label="Refresh from Poynt"
                            disabled={
                              applePayBusy ||
                              !applePay.artifactStorageConfigured
                            }
                            onPress={() =>
                              void runApplePay(
                                "Refresh association file",
                                platformPaymentConfigurationApi.refreshApplePayAssociation,
                              )
                            }
                          />
                          <Button
                            label="Approve"
                            disabled={
                              applePayBusy ||
                              !applePay.artifact ||
                              applePay.artifact.status === "APPROVED"
                            }
                            onPress={() =>
                              applePay.artifact &&
                              confirmApplePay(
                                "Approve association file",
                                "Approve this immutable artifact for controlled publication?",
                                () =>
                                  void runApplePay(
                                    "Approve association file",
                                    (id) =>
                                      platformPaymentConfigurationApi.approveApplePayAssociation(
                                        id,
                                        applePay.artifact!.artifactId,
                                      ),
                                  ),
                              )
                            }
                          />
                          <Button
                            label="Publish & Verify"
                            disabled={
                              applePayBusy ||
                              applePay.artifact?.status !== "APPROVED"
                            }
                            onPress={() =>
                              applePay.artifact &&
                              confirmApplePay(
                                "Publish association file",
                                "Stage this approved artifact and verify its current public hosting state.",
                                () =>
                                  void runApplePay(
                                    "Publish association file",
                                    (id) =>
                                      platformPaymentConfigurationApi.publishApplePayAssociation(
                                        id,
                                        applePay.artifact!.artifactId,
                                      ),
                                  ),
                              )
                            }
                          />
                          <Button
                            label="Register Merchant"
                            disabled={
                              applePayBusy ||
                              !applePay.registrationActionEnabled ||
                              ![
                                "NOT_REGISTERED",
                                "REGISTRATION_INCONCLUSIVE",
                              ].includes(applePay.readiness.status)
                            }
                            onPress={() =>
                              confirmApplePay(
                                "Register Apple Pay merchant",
                                `Register ${applePay.checkoutHostname} with this configured Poynt merchant?`,
                                () =>
                                  void runApplePay(
                                    "Register merchant",
                                    platformPaymentConfigurationApi.registerApplePay,
                                  ),
                              )
                            }
                          />
                          <Button
                            label={
                              applePay.capabilityEnabled
                                ? "Disable Apple Pay"
                                : "Enable Apple Pay"
                            }
                            disabled={
                              applePayBusy ||
                              (!applePay.capabilityEnabled &&
                                applePay.readiness.status !== "READY")
                            }
                            onPress={() =>
                              confirmApplePay(
                                applePay.capabilityEnabled
                                  ? "Disable Apple Pay"
                                  : "Enable Apple Pay",
                                applePay.capabilityEnabled
                                  ? "Disable Apple Pay for this integration without unregistering the merchant?"
                                  : "Enable Apple Pay only for this selected Poynt integration?",
                                () =>
                                  void runApplePay(
                                    "Update Apple Pay capability",
                                    (id) =>
                                      platformPaymentConfigurationApi.setApplePayCapability(
                                        id,
                                        !applePay.capabilityEnabled,
                                      ),
                                  ),
                              )
                            }
                          />
                        </View>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
              <Text variant="bodySmall" color="textMuted">
                Cloud App credentials are assigned by Memgine platform
                configuration and are never displayed here.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Button
                  label="Cancel"
                  disabled={saving}
                  onPress={() => setSelected(null)}
                />
                <Button
                  label={saving ? "Saving…" : "Save"}
                  disabled={saving || profiles.length === 0}
                  onPress={() => void save()}
                />
                <Button
                  label="Verify / Test Connection"
                  disabled={saving}
                  onPress={() => void test(selected)}
                />
              </View>
            </View>
          )}
        </View>
      ) : null}

      <Modal
        visible={!!shell}
        onClose={() => !saving && setShell(null)}
        title="Edit Integration"
        scrollable
      >
        <View style={{ gap: 12 }}>
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
            items={providers}
            onChange={(value) =>
              setShell((item) =>
                item ? { ...item, provider: value as "POYNT" } : item,
              )
            }
          />
          <ReferenceSelect
            label="Status"
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
            label={saving ? "Saving…" : "Save Integration"}
            disabled={saving}
            onPress={() => void saveShell()}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const section = {
  gap: 12,
  padding: 16,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  borderRadius: 8,
} as const;
const actions = { flexDirection: "row", flexWrap: "wrap", gap: 12 } as const;
const applePaySection = {
  gap: 12,
  padding: 14,
  borderWidth: 1,
  borderColor: "#D1D5DB",
  borderRadius: 8,
  backgroundColor: "#F9FAFB",
} as const;
const applePayGrid = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 12,
} as const;

function ApplePayField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "47%" as any, minWidth: 180, gap: 2 }}>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
    </View>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
