import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import type { ReferenceDataItem, Store } from "@/src/core";
import {
  organizationPoyntOperationalApi,
  organizationPoyntPaymentApi,
  type OrganizationPoyntPaymentSummary,
  type PoyntOperationalStore,
  type PoyntOperationalTerminal,
  type PoyntStoreCatalogConfiguration,
} from "@/src/data/api/platform-poynt-payment-api";
import { useTheme } from "@/src/providers";
import { Input, ReferenceSelect, Text } from "@/src/ui";
type Props = {
  organizationId: string;
  summary: OrganizationPoyntPaymentSummary;
  stores: Store[];
  integrationTypeId: string;
  integrationTypes: ReferenceDataItem[];
  onClose: () => void;
};
type PoyntPolicies = {
  storeDiscovery: boolean;
  terminalDiscovery: boolean;
  manualStore: boolean;
  manualTerminal: boolean;
  verificationRequired: boolean;
};
const policyValue = (
  policies: Record<string, Record<string, boolean>> | undefined,
  key: string,
) => policies?.POYNT?.[key] === true;
export function PoyntStoreTerminalManager({
  organizationId,
  summary,
  stores,
  integrationTypeId,
  integrationTypes,
  onClose,
}: Props) {
  const theme = useTheme();
  const requestVersion = useRef(0);
  const [configurations, setConfigurations] = useState<
    PoyntStoreCatalogConfiguration[]
  >([]);
  const [poyntStores, setPoyntStores] = useState<PoyntOperationalStore[]>([]);
  const [terminals, setTerminals] = useState<PoyntOperationalTerminal[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedPoyntStoreId, setSelectedPoyntStoreId] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [terminalRefreshVersion, setTerminalRefreshVersion] = useState(0);
  const [showAssignment, setShowAssignment] = useState(false);
  const [showConfigurationDetails, setShowConfigurationDetails] =
    useState(false);
  const [manualStore, setManualStore] = useState(false);
  const [manualTerminal, setManualTerminal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTerminals, setLoadingTerminals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const policies = useMemo<PoyntPolicies | null>(() => {
    const item = integrationTypes.find((type) => type.id === integrationTypeId);
    const configured = item?.providerConfigurationPolicies;
    if (!configured) return null;
    return {
      storeDiscovery: policyValue(configured, "STORE_DISCOVERY_SUPPORTED"),
      terminalDiscovery: policyValue(
        configured,
        "TERMINAL_DISCOVERY_SUPPORTED",
      ),
      manualStore: policyValue(configured, "MANUAL_STORE_ENTRY_ALLOWED"),
      manualTerminal: policyValue(configured, "MANUAL_TERMINAL_ENTRY_ALLOWED"),
      verificationRequired: policyValue(
        configured,
        "PROVIDER_VERIFICATION_REQUIRED",
      ),
    };
  }, [integrationTypeId, integrationTypes]);
  const selectedConfiguration = configurations.find(
    (configuration) => configuration.storeId === selectedStoreId,
  );
  const selectedTerminal = terminals.find(
    (terminal) => terminal.id === selectedTerminalId,
  );
  const activeTerminalAssignments = useMemo(
    () =>
      new Map(
        configurations.flatMap((configuration) =>
          configuration.terminalBindings
            .filter((binding) => binding.active)
            .map(
              (binding) =>
                [
                  binding.poyntTerminalId,
                  {
                    storeId: configuration.storeId,
                    storeName: configuration.storeName,
                  },
                ] as const,
            ),
        ),
      ),
    [configurations],
  );
  const isConfigured = !!selectedConfiguration?.effectiveCatalogId;
  const activeBindings =
    selectedConfiguration?.terminalBindings.filter(
      (binding) => binding.active,
    ) ?? [];
  const needsCompletion = !isConfigured && activeBindings.length > 0;
  const legacyPoyntStoreId =
    needsCompletion &&
    activeBindings.every(
      (binding) => binding.poyntStoreId === activeBindings[0].poyntStoreId,
    )
      ? activeBindings[0].poyntStoreId
      : "";
  const isAddingTerminal = isConfigured;
  const terminalUnavailableReason = (
    terminal: PoyntOperationalTerminal,
  ): string | undefined => {
    if (!terminal.configurationEligible) {
      return (
        terminal.ineligibilityReason ?? "This terminal cannot be configured."
      );
    }
    const assignment = activeTerminalAssignments.get(terminal.id);
    if (!assignment) return undefined;
    if (isAddingTerminal) {
      return `Already assigned to ${assignment.storeName}.`;
    }
    if (assignment.storeId !== selectedStoreId) {
      return `Already assigned to ${assignment.storeName}.`;
    }
    return undefined;
  };
  const selectedTerminalUnavailableReason = selectedTerminal
    ? terminalUnavailableReason(selectedTerminal)
    : undefined;
  const catalogMismatch =
    !!selectedConfiguration?.effectiveCatalogId &&
    !!selectedTerminal?.catalogId &&
    selectedConfiguration.effectiveCatalogId !== selectedTerminal.catalogId;
  const canSave =
    !!policies?.verificationRequired &&
    !!selectedStoreId &&
    !!selectedPoyntStoreId.trim() &&
    !!selectedTerminalId.trim() &&
    !catalogMismatch &&
    !selectedTerminalUnavailableReason &&
    (manualTerminal || !!selectedTerminal) &&
    !saving;
  const resetAssignment = () => {
    setSelectedPoyntStoreId(
      selectedConfiguration?.poyntStoreId || legacyPoyntStoreId,
    );
    setSelectedTerminalId("");
    setTerminals([]);
    setManualStore(false);
    setManualTerminal(false);
    setMessage(null);
  };
  const loadConfigurations = async () => {
    const result = await organizationPoyntOperationalApi.configurations(
      organizationId,
      summary.integrationConfigurationId,
    );
    if (!result.success) throw new Error(result.error.message);
    setConfigurations(result.data);
    return result.data;
  };
  const loadStores = async () => {
    if (!policies?.storeDiscovery) return;
    const result = await organizationPoyntOperationalApi.stores(
      organizationId,
      summary.integrationConfigurationId,
    );
    if (!result.success) throw new Error(result.error.message);
    setPoyntStores(result.data);
  };
  const refreshInitial = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const [configurations] = await Promise.all([
        loadConfigurations(),
        loadStores(),
      ]);
      if (version !== requestVersion.current) return;
      if (!selectedStoreId && configurations.length === 1) {
        setSelectedStoreId(configurations[0].storeId);
      }
    } catch (loadError) {
      if (version === requestVersion.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Poynt configuration.",
        );
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (!policies) {
      setLoading(false);
      setError("Poynt configuration policy is unavailable.");
      return;
    }
    void refreshInitial();
    return () => {
      requestVersion.current += 1;
    };
    // The modal receives a stable integration and reference-data snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, summary.integrationConfigurationId, policies]);
  useEffect(() => {
    resetAssignment();
    // selectedConfiguration derives from the selected store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);
  useEffect(() => {
    if (!showAssignment && selectedConfiguration?.poyntStoreId) {
      setSelectedPoyntStoreId(selectedConfiguration.poyntStoreId);
    }
  }, [selectedConfiguration?.poyntStoreId, showAssignment]);
  useEffect(() => {
    if (
      !selectedPoyntStoreId ||
      manualTerminal ||
      !policies?.terminalDiscovery
    ) {
      setTerminals([]);
      return;
    }
    const version = ++requestVersion.current;
    setLoadingTerminals(true);
    setError(null);
    setSelectedTerminalId("");
    void organizationPoyntOperationalApi
      .terminals(
        organizationId,
        summary.integrationConfigurationId,
        selectedPoyntStoreId,
      )
      .then((result) => {
        if (version !== requestVersion.current) return;
        if (!result.success) throw new Error(result.error.message);
        setTerminals(result.data);
        if (needsCompletion) {
          const existing = activeBindings.find(
            (binding) =>
              binding.poyntStoreId === selectedPoyntStoreId &&
              result.data.some(
                (terminal) =>
                  terminal.id === binding.poyntTerminalId &&
                  terminal.configurationEligible,
              ),
          );
          if (existing) setSelectedTerminalId(existing.poyntTerminalId);
        }
      })
      .catch((loadError: unknown) => {
        if (version === requestVersion.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load Poynt terminals.",
          );
        }
      })
      .finally(() => {
        if (version === requestVersion.current) setLoadingTerminals(false);
      });
  }, [
    manualTerminal,
    organizationId,
    policies?.terminalDiscovery,
    selectedPoyntStoreId,
    summary.integrationConfigurationId,
    terminalRefreshVersion,
  ]);
  const selectMemgineStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    setShowAssignment(false);
    setShowConfigurationDetails(false);
    setError(null);
  };
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const result = await organizationPoyntOperationalApi.saveAssignment(
        organizationId,
        summary.integrationConfigurationId,
        {
          storeId: selectedStoreId,
          poyntStoreId: selectedPoyntStoreId.trim(),
          terminalId: selectedTerminalId.trim(),
        },
      );
      if (!result.success) throw new Error(result.error.message);
      await loadConfigurations();
      setShowAssignment(false);
      setSelectedTerminalId("");
      setTerminalRefreshVersion((version) => version + 1);
      setMessage(
        needsCompletion
          ? "Store setup completed."
          : "Terminal assignment saved.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the terminal assignment.",
      );
    } finally {
      setSaving(false);
    }
  };
  const deactivate = (bindingId: string, name: string) => {
    Alert.alert(
      "Deactivate terminal",
      `Deactivate ${name}? This does not change the effective catalog or the terminal in Poynt.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () =>
            void organizationPoyntPaymentApi
              .deactivateTerminal(
                organizationId,
                summary.integrationConfigurationId,
                bindingId,
              )
              .then((result) => {
                if (!result.success) throw new Error(result.error.message);
                return loadConfigurations().then(() =>
                  setTerminalRefreshVersion((version) => version + 1),
                );
              })
              .catch((deactivateError: unknown) =>
                setError(
                  deactivateError instanceof Error
                    ? deactivateError.message
                    : "Unable to deactivate the terminal.",
                ),
              ),
        },
      ],
    );
  };
  const openAssignment = () => {
    resetAssignment();
    setShowAssignment(true);
    setShowConfigurationDetails(false);
  };

  const storeName = (id?: string | null) =>
    poyntStores.find((store) => store.id === id)?.name ||
    id ||
    "Not configured";
  return (
    <View style={[styles.container, { gap: theme.spacing.md }]}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="body" color="text">
          {summary.integrationName} / Poynt
        </Text>
        <Text variant="bodySmall" color="textMuted">
          Select a Memgine Store first. Poynt assignment is verified before it
          is saved.
        </Text>
      </View>
      <ReferenceSelect
        label="Memgine Store"
        required
        value={selectedStoreId}
        items={stores}
        getItemId={(store) => store.id}
        renderItemLabel={(store) => `${store.name} (${store.storeCode})`}
        onChange={selectMemgineStore}
        placeholder="Select a Memgine Store"
      />
      {loading ? (
        <Text variant="body" color="textMuted">
          Loading configuration…
        </Text>
      ) : null}
      {error ? (
        <Text variant="bodySmall" color="danger">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text variant="bodySmall" color="success">
          {message}
        </Text>
      ) : null}
      {selectedStoreId ? (
        <View
          style={[
            styles.panel,
            { borderColor: theme.colors.border, gap: theme.spacing.md },
          ]}
        >
          <View style={styles.inlineActions}>
            <Text variant="h2" color="text">
              Store Configuration
            </Text>
            <Text
              variant="bodySmall"
              color={isConfigured ? "success" : "textMuted"}
            >
              {isConfigured
                ? "✓ Configured"
                : needsCompletion
                  ? "Existing assignment · Setup incomplete"
                  : "Not configured"}
            </Text>
          </View>

          {isConfigured || needsCompletion ? (
            <View style={styles.summaryColumns}>
              <View style={styles.summaryColumn}>
                <Text variant="caption" color="textMuted">
                  Poynt Store
                </Text>
                <Text variant="body" color="text">
                  {storeName(
                    selectedConfiguration?.poyntStoreId || legacyPoyntStoreId,
                  )}
                </Text>
              </View>
              <View style={styles.summaryColumn}>
                <Text variant="caption" color="textMuted">
                  Product Catalog
                </Text>
                <Text variant="body" color="text">
                  {isConfigured
                    ? selectedConfiguration?.effectiveCatalogName ||
                      "Catalog name not supplied by Poynt"
                    : "Pending verification"}
                </Text>
              </View>
            </View>
          ) : (
            <Text variant="bodySmall" color="textMuted">
              No Poynt Store or terminal has been configured for this Memgine
              Store.
            </Text>
          )}

          {needsCompletion ? (
            <Text variant="bodySmall" color="textMuted">
              An existing terminal is assigned. Complete setup to verify its
              Poynt Store and catalog without creating a duplicate terminal
              binding.
            </Text>
          ) : null}

          {activeBindings.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="body" color="text">
                Terminals ({activeBindings.length})
              </Text>
              {activeBindings.map((binding) => (
                <View
                  key={binding.bindingId}
                  style={[
                    styles.terminalRow,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" color="text">
                      {binding.deviceName}
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      Active · {storeName(binding.poyntStoreId)}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      Device ID: {binding.poyntTerminalId}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      deactivate(binding.bindingId, binding.deviceName)
                    }
                  >
                    <Text variant="bodySmall" color="danger">
                      Deactivate
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {isConfigured && !showAssignment ? (
            <View style={styles.summaryActions}>
              <Pressable
                onPress={() => {
                  setShowAssignment(false);
                  setShowConfigurationDetails((visible) => !visible);
                }}
                style={[
                  styles.secondaryAction,
                  { borderColor: theme.colors.border },
                ]}
              >
                <Text variant="body" color="text">
                  {showConfigurationDetails
                    ? "Hide Details"
                    : "Configuration Details"}
                </Text>
              </Pressable>
              <Pressable
                onPress={openAssignment}
                style={[
                  styles.secondaryAction,
                  { borderColor: theme.colors.border },
                ]}
              >
                <Text variant="body" color="text">
                  + Add Terminal
                </Text>
              </Pressable>
            </View>
          ) : !isConfigured && !showAssignment ? (
            <Pressable
              onPress={openAssignment}
              style={[styles.action, { backgroundColor: theme.colors.primary }]}
            >
              <Text variant="body" color="background">
                {needsCompletion ? "Complete Setup" : "Add Configuration"}
              </Text>
            </Pressable>
          ) : null}

          {showConfigurationDetails && isConfigured ? (
            <View
              style={[
                styles.catalog,
                { backgroundColor: theme.colors.surfaceAlt },
              ]}
            >
              <Text variant="bodySmall" color="textMuted">
                The Poynt Store and effective catalog cannot currently be
                changed for a configured Store. Add compatible terminals or
                deactivate an existing terminal. No changes are made from this
                details view.
              </Text>
              <Text variant="caption" color="textMuted">
                Catalog ID: {selectedConfiguration?.effectiveCatalogId}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {showAssignment ? (
        <View
          style={[
            styles.panel,
            { borderColor: theme.colors.border, gap: theme.spacing.md },
          ]}
        >
          <View style={styles.inlineActions}>
            <Text variant="h2" color="text">
              {isAddingTerminal
                ? "Add Terminal"
                : needsCompletion
                  ? "Complete Configuration"
                  : "Configure Poynt Store"}
            </Text>
            <Pressable
              onPress={() =>
                void loadStores().catch((refreshError: unknown) =>
                  setError(
                    refreshError instanceof Error
                      ? refreshError.message
                      : "Unable to refresh Poynt Stores.",
                  ),
                )
              }
            >
              <Text variant="bodySmall" color="primary">
                Refresh Stores
              </Text>
            </Pressable>
          </View>
          {selectedConfiguration?.poyntStoreId ? (
            <Text variant="bodySmall" color="textMuted">
              Poynt Store: {storeName(selectedConfiguration.poyntStoreId)}.
              Store selection is locked for this configured Memgine Store.
            </Text>
          ) : manualStore ? (
            <Input
              label="Poynt Store ID"
              value={selectedPoyntStoreId}
              onChangeText={setSelectedPoyntStoreId}
            />
          ) : (
            <ReferenceSelect
              label="Poynt Store"
              required
              value={selectedPoyntStoreId}
              items={poyntStores}
              getItemId={(store) => store.id}
              renderItemLabel={(store) => store.name || store.id}
              onChange={setSelectedPoyntStoreId}
              disabled={!policies?.storeDiscovery}
              placeholder="Select a Poynt Store"
            />
          )}
          {!selectedConfiguration?.poyntStoreId && policies?.manualStore ? (
            <Pressable onPress={() => setManualStore((current) => !current)}>
              <Text variant="bodySmall" color="primary">
                {manualStore ? "Use discovered Stores" : "Enter Store Manually"}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.inlineActions}>
            <Text variant="body" color="text">
              Available Terminal
            </Text>
            <Pressable
              disabled={!selectedPoyntStoreId || loadingTerminals}
              onPress={() =>
                setTerminalRefreshVersion((version) => version + 1)
              }
            >
              <Text
                variant="bodySmall"
                color={selectedPoyntStoreId ? "primary" : "textMuted"}
              >
                Refresh
              </Text>
            </Pressable>
          </View>
          {manualTerminal ? (
            <Input
              label="Poynt Terminal / Device ID"
              value={selectedTerminalId}
              onChangeText={setSelectedTerminalId}
            />
          ) : (
            <ReferenceSelect
              label="Available Terminal"
              required
              value={selectedTerminalId}
              items={terminals}
              getItemId={(terminal) => terminal.id}
              renderItemLabel={(terminal) =>
                `${terminal.name || "Unnamed terminal"} (${terminal.id})`
              }
              isItemDisabled={(terminal) =>
                !!terminalUnavailableReason(terminal)
              }
              renderItemDisabledReason={terminalUnavailableReason}
              onChange={setSelectedTerminalId}
              disabled={!selectedPoyntStoreId || loadingTerminals}
              placeholder={
                loadingTerminals ? "Loading terminals…" : "Select a terminal"
              }
            />
          )}
          {policies?.manualTerminal ? (
            <Pressable onPress={() => setManualTerminal((current) => !current)}>
              <Text variant="bodySmall" color="primary">
                {manualTerminal
                  ? "Use discovered terminals"
                  : "Enter Terminal Manually"}
              </Text>
            </Pressable>
          ) : null}
          <View
            style={[
              styles.catalog,
              { backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <Text variant="bodySmall" color="textMuted">
              Assigned Product Catalog
            </Text>
            <Text variant="body" color="text">
              {selectedTerminal
                ? selectedTerminal.catalogName ||
                  "Catalog name not supplied by Poynt"
                : "Select a terminal to view its assigned catalog."}
            </Text>
            {selectedTerminal?.catalogId ? (
              <Text variant="caption" color="textMuted">
                Catalog ID: {selectedTerminal.catalogId}
              </Text>
            ) : null}
            {selectedTerminalUnavailableReason ? (
              <Text variant="bodySmall" color="danger">
                {selectedTerminalUnavailableReason}
              </Text>
            ) : null}
            {catalogMismatch ? (
              <Text variant="bodySmall" color="danger">
                This terminal uses a different catalog than the Store’s
                effective catalog.
              </Text>
            ) : null}
          </View>
          <Pressable
            disabled={!canSave}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: theme.colors.primary,
                opacity: canSave ? (pressed ? 0.8 : 1) : 0.5,
              },
            ]}
          >
            <Text variant="body" color="background">
              {saving
                ? "Saving…"
                : needsCompletion
                  ? "Complete Setup"
                  : "Save Assignment"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowAssignment(false);
              resetAssignment();
            }}
            style={styles.cancel}
          >
            <Text variant="body" color="text">
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable onPress={onClose} style={styles.cancel}>
        <Text variant="body" color="text">
          Close
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { paddingBottom: 4 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 },
  terminalRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  action: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cancel: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  inlineActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  catalog: { borderRadius: 8, padding: 12, gap: 4 },
  summaryColumns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  summaryColumn: { flexGrow: 1, flexBasis: 180, gap: 5 },
  summaryActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryAction: {
    flexGrow: 1,
    flexBasis: 170,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
