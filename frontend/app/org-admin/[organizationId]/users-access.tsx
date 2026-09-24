import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import type { Store } from "@/src/core";
import { type OrganizationAccessUser } from "@/src/data/api/organization-access-api";
import { apis } from "@/src/data/data-registry";
import type { ApiResult } from "@/src/data/api/result";
import { useBusiness } from "@/src/providers";
import {
  Button,
  Checkbox,
  DataTable,
  type DataTableColumn,
  Input,
  Modal,
  ReferenceSelect,
  StateView,
  Text,
} from "@/src/ui";

type AccessMutation = ApiResult<boolean | string | null>;

function isActiveMembership(user: OrganizationAccessUser): boolean {
  return user.membershipStatus.toUpperCase() === "ACTIVE";
}

function isOrgAdmin(user: OrganizationAccessUser): boolean {
  return user.capabilities.includes("ORG_ADMIN_ACCESS");
}

function displayList(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function storesList(user: OrganizationAccessUser): string {
  return user.additionalStoreAssignments.length
    ? user.additionalStoreAssignments.map((item) => item.storeName).join(", ")
    : "—";
}

export default function OrganizationUsersAccess() {
  const { organization } = useBusiness();
  return <OrganizationUsersAccessScreen organizationId={organization.id} />;
}

function OrganizationUsersAccessScreen({ organizationId }: { organizationId: string }) {
  const [users, setUsers] = useState<OrganizationAccessUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrganizationAccessUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [pinEntryVisible, setPinEntryVisible] = useState(false);
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [designation, setDesignation] = useState("");
  const [primaryStoreId, setPrimaryStoreId] = useState("");
  const [additionalStoreIds, setAdditionalStoreIds] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const hydrateEditor = useCallback((user: OrganizationAccessUser) => {
    setSelected(user);
    setMutationError(null);
    setDesignation(user.designation ?? "");
    setPrimaryStoreId(user.primaryStore?.storeId ?? "");
    setAdditionalStoreIds(user.additionalStoreAssignments.map((item) => item.storeId));
    setPin("");
    setConfirmPin("");
  }, []);

  const openUser = useCallback((user: OrganizationAccessUser) => {
    hydrateEditor(user);
    setEditing(false);
    setPinEntryVisible(false);
  }, [hydrateEditor]);

  const cancelEdit = useCallback(() => {
    if (selected) hydrateEditor(selected);
    setMutationError(null);
    setPinEntryVisible(false);
    setEditing(false);
  }, [hydrateEditor, selected]);

  const load = useCallback(async (showLoading = false): Promise<OrganizationAccessUser[]> => {
    if (showLoading) setLoading(true);
    const [accessResult, storesResult] = await Promise.all([
      apis.organizationAccess.list(organizationId),
      apis.store.list(organizationId),
    ]);

    if (!accessResult.success) throw new Error(accessResult.error.message);
    if (!storesResult.success) throw new Error(storesResult.error.message);

    setUsers(accessResult.data);
    setStores(storesResult.data);
    return accessResult.data;
  }, [organizationId]);

  useEffect(() => {
    let current = true;
    setError(null);
    void load(true)
      .catch((failure: unknown) => {
        if (current) setError(failure instanceof Error ? failure.message : "Unable to load organization users.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [load]);

  const columns = useMemo<DataTableColumn<OrganizationAccessUser>[]>(() => [
    {
      key: "name",
      title: "User",
      width: 220,
      render: (user) => <View style={styles.cell}><Text variant="bodyStrong" color="text">{user.displayName}</Text>{user.email ? <Text variant="caption" color="textMuted">{user.email}</Text> : null}{user.phone ? <Text variant="caption" color="textMuted">{user.phone}</Text> : null}{!user.email && !user.phone ? <Text variant="caption" color="textMuted">No contact details</Text> : null}</View>,
    },
    { key: "membership", title: "Membership", width: 130, render: (user) => <Text variant="body" color="text">{user.membershipStatus}</Text> },
    { key: "roles", title: "Roles", width: 190, render: (user) => <Text variant="body" color="text" numberOfLines={2}>{displayList(user.roles)}</Text> },
    { key: "admin", title: "Org Admin", width: 115, render: (user) => <Text variant="body" color="text">{isOrgAdmin(user) ? "Yes" : "No"}</Text> },
    { key: "operator", title: "Counter Operator", width: 150, render: (user) => <Text variant="body" color="text">{user.counterOperatorEnabled ? "Yes" : "No"}</Text> },
    { key: "staffCode", title: "Staff Code", width: 130, render: (user) => <Text variant="body" color="text">{user.staffCode ?? "—"}</Text> },
    { key: "primaryStore", title: "Primary Store", width: 180, render: (user) => <Text variant="body" color="text">{user.primaryStore?.storeName ?? "—"}</Text> },
    { key: "additionalStores", title: "Additional Stores", width: 220, render: (user) => <Text variant="body" color="text" numberOfLines={2}>{storesList(user)}</Text> },
    { key: "pin", title: "POS PIN", width: 110, render: (user) => <Text variant="body" color="text">{user.posPinConfigured ? "Configured" : "Not set"}</Text> },
  ], []);

  async function refreshSelected(): Promise<void> {
    const refreshed = await load();
    if (!selected) return;
    const next = refreshed.find((user) => user.organizationUserId === selected.organizationUserId);
    if (next) hydrateEditor(next);
    else setSelected(null);
  }

  async function mutate(action: () => Promise<AccessMutation>, clearPin = false): Promise<void> {
    setSaving(true);
    setMutationError(null);
    try {
      const result = await action();
      if (!result.success) throw new Error(result.error.message);
      await refreshSelected();
      setPinEntryVisible(false);
      setEditing(false);
    } catch (failure) {
      setMutationError(failure instanceof Error ? failure.message : "Unable to update user access.");
      try { await refreshSelected(); } catch { /* Preserve the actionable mutation error. */ }
    } finally {
      if (clearPin) {
        setPin("");
        setConfirmPin("");
      }
      setSaving(false);
    }
  }

  function toggleAdditionalStore(storeId: string): void {
    if (storeId === primaryStoreId) return;
    setAdditionalStoreIds((current) => current.includes(storeId)
      ? current.filter((id) => id !== storeId)
      : [...current, storeId]);
  }

  function changePrimaryStore(storeId: string): void {
    setPrimaryStoreId(storeId);
    setAdditionalStoreIds((current) => current.filter((id) => id !== storeId));
  }

  function setMembership(active: boolean): void {
    if (!selected) return;
    const execute = () => void mutate(() => apis.organizationAccess.setMembership(organizationId, selected.organizationUserId, active));
    if (active) execute();
    else Alert.alert(
      "Inactivate organization membership?",
      "This removes the user's organization access. Historical records are retained.",
      [{ text: "Cancel", style: "cancel" }, { text: "Inactivate", style: "destructive", onPress: execute }],
    );
  }

  function setAdmin(enabled: boolean): void {
    if (!selected) return;
    const execute = () => void mutate(() => apis.organizationAccess.setOrgAdmin(organizationId, selected.organizationUserId, enabled));
    if (enabled) execute();
    else Alert.alert(
      "Remove Organization Admin?",
      "This removes organization administration access but retains any Counter Operator profile.",
      [{ text: "Cancel", style: "cancel" }, { text: "Remove Org Admin", style: "destructive", onPress: execute }],
    );
  }

  function saveCounterOperator(enabled: boolean): void {
    if (!selected) return;
    if (enabled && !primaryStoreId && !selected.primaryStore) {
      setMutationError("Select a primary store before enabling Counter Operator.");
      return;
    }
    void mutate(() => apis.organizationAccess.setCounterOperator(organizationId, selected.organizationUserId, {
      enabled,
      ...(enabled ? { designation: designation.trim() || undefined, primaryStoreId: primaryStoreId || undefined } : {}),
    }));
  }

  function resetAddUser(): void {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");
    setMutationError(null);
  }

  function addUser(): void {
    const firstName = newFirstName.trim();
    const lastName = newLastName.trim();
    const phone = newPhone.trim();
    if (!firstName || !phone) {
      setMutationError("First name and phone are required.");
      return;
    }
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userId = `user-${nonce}`;
    const organizationUserId = `organization-user-${nonce}`;
    setSaving(true);
    setMutationError(null);
    void apis.organizationUser.upsert(organizationId, {
      userId,
      userCode: `USR-${Date.now()}`,
      firstName,
      lastName: lastName || undefined,
      displayName: [firstName, lastName].filter(Boolean).join(" "),
      primaryEmail: newEmail.trim().toLowerCase() || undefined,
      primaryPhone: phone,
      organizationUserId,
      organizationUserTypeId: "organization-user-type-employee",
      joiningDate: new Date().toISOString().slice(0, 10),
    }).then(async (result) => {
      if (!result.success) throw new Error(result.error.message);
      const refreshed = await load();
      const created = refreshed.find((user) => user.organizationUserId === organizationUserId);
      setAddUserVisible(false);
      resetAddUser();
      if (created) hydrateEditor(created);
    }).catch((failure: unknown) => {
      setMutationError(failure instanceof Error ? failure.message : "Unable to add organization user.");
    }).finally(() => setSaving(false));
  }

  function saveCounterSettings(): void {
    if (!selected) return;
    if (!primaryStoreId) {
      setMutationError("Select a primary store before saving Counter settings.");
      return;
    }
    setSaving(true);
    setMutationError(null);
    void (async () => {
      const operator = await apis.organizationAccess.setCounterOperator(organizationId, selected.organizationUserId, {
        enabled: true,
        designation: designation.trim() || undefined,
        primaryStoreId,
      });
      if (!operator.success) throw new Error(operator.error.message);
      const storesResult = await apis.organizationAccess.setStores(organizationId, selected.organizationUserId, {
        primaryStoreId,
        additionalStoreIds: additionalStoreIds.filter((id) => id !== primaryStoreId),
      });
      if (!storesResult.success) throw new Error(storesResult.error.message);
      await refreshSelected();
      setEditing(false);
    })().catch((failure: unknown) => {
      setMutationError(failure instanceof Error ? failure.message : "Unable to save Counter settings.");
    }).finally(() => setSaving(false));
  }

  function savePin(): void {
    if (!selected) return;
    if (!/^\d{4}$/.test(pin) || pin !== confirmPin) {
      setPin("");
      setConfirmPin("");
      setMutationError("Enter matching 4-digit PIN values.");
      return;
    }
    void mutate(() => apis.organizationAccess.setPosPin(organizationId, selected.organizationUserId, pin), true);
  }

  if (loading) return <StateView kind="loading" title="Loading users and access" />;
  if (error) return <StateView kind="error" title="Unable to load users and access" message={error} actionLabel="Retry" onAction={() => { setError(null); void load(true).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Unable to load organization users.")).finally(() => setLoading(false)); }} />;

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="title" color="text">Users & Access</Text>
        <Text variant="bodySmall" color="textMuted">Manage organization membership, administrative access, Counter Operator profiles, stores, and POS PINs.</Text>
      </View>
      <View style={styles.headerActions}><Button label="Add User" disabled={saving} onPress={() => { resetAddUser(); setAddUserVisible(true); }} /><Button label="Reload" variant="secondary" disabled={saving} onPress={() => void load().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Unable to reload organization users."))} /></View>
    </View>
    <DataTable columns={columns} data={users} keyExtractor={(user) => user.organizationUserId} minTableWidth={1620}
      emptyMessage="No users are associated with this organization."
      actions={[{ label: "View", onPress: openUser }]} />

    <Modal visible={selected !== null} onClose={() => { if (!saving) { setSelected(null); setEditing(false); setPinEntryVisible(false); } }} title={selected ? `Access — ${selected.displayName}` : "User access"} scrollable>
      {selected ? <View style={styles.modalContent}>
        {mutationError ? <View style={styles.errorBox}><Text variant="bodySmall" color="danger">{mutationError}</Text></View> : null}
        {!editing ? <>
          <View style={styles.summary}><Text variant="bodySmall" color="textMuted">Email</Text><Text variant="body" color="text">{selected.email ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Phone</Text><Text variant="body" color="text">{selected.phone ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Membership</Text><Text variant="body" color="text">{selected.membershipStatus}</Text><Text variant="bodySmall" color="textMuted">Roles</Text><Text variant="body" color="text">{displayList(selected.roles)}</Text><Text variant="bodySmall" color="textMuted">Capabilities</Text><Text variant="body" color="text">{displayList(selected.capabilities)}</Text></View>
          <View style={styles.section}><Text variant="h2" color="text">Organization Administrator</Text><Text variant="body" color="text">{isOrgAdmin(selected) ? "Yes" : "No"}</Text></View>
          <View style={styles.section}><Text variant="h2" color="text">Counter Operator</Text><Text variant="body" color="text">{selected.counterOperatorEnabled ? "Enabled" : "Not enabled"}</Text><Text variant="bodySmall" color="textMuted">Staff Code</Text><Text variant="body" color="text">{selected.staffCode ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Designation</Text><Text variant="body" color="text">{selected.designation ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Primary Store</Text><Text variant="body" color="text">{selected.primaryStore?.storeName ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Additional Stores</Text><Text variant="body" color="text">{storesList(selected)}</Text></View>
          <View style={styles.section}><Text variant="h2" color="text">POS PIN</Text><Text variant="body" color="text">{selected.posPinConfigured ? "••••" : "Not configured"}</Text></View>
          <Button label="Edit" disabled={saving} onPress={() => { setMutationError(null); setEditing(true); }} />
        </> : <>
          <View style={styles.summary}><Text variant="bodySmall" color="textMuted">Email</Text><Text variant="body" color="text">{selected.email ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Phone</Text><Text variant="body" color="text">{selected.phone ?? "—"}</Text><Text variant="bodySmall" color="textMuted">Roles</Text><Text variant="body" color="text">{displayList(selected.roles)}</Text><Text variant="bodySmall" color="textMuted">Capabilities</Text><Text variant="body" color="text">{displayList(selected.capabilities)}</Text></View>
          <View style={styles.section}><Text variant="h2" color="text">Organization membership</Text><Text variant="bodySmall" color="textMuted">Status: {selected.membershipStatus}</Text><Button label={isActiveMembership(selected) ? "Inactivate membership" : "Activate membership"} variant={isActiveMembership(selected) ? "outline" : "primary"} disabled={saving} onPress={() => setMembership(!isActiveMembership(selected))} /></View>
          <View style={styles.section}><Text variant="h2" color="text">Organization Administrator</Text><Text variant="bodySmall" color="textMuted">{isOrgAdmin(selected) ? "This user has organization administration access." : "This user does not have organization administration access."}</Text><Button label={isOrgAdmin(selected) ? "Remove Org Admin" : "Grant Org Admin"} variant={isOrgAdmin(selected) ? "outline" : "primary"} disabled={saving} onPress={() => setAdmin(!isOrgAdmin(selected))} /></View>
          <View style={styles.section}><Text variant="h2" color="text">Counter Operator</Text><Text variant="bodySmall" color="textMuted">{selected.counterOperatorEnabled ? "Enabled. This operational profile is independent of Org Admin." : "Enable an operational profile for Counter access."}</Text><Text variant="bodySmall" color="textMuted">Staff Code</Text><Text variant="body" color="text">{selected.staffCode ?? "Generated when Counter Operator is enabled"}</Text><Input label="Designation" value={designation} onChangeText={setDesignation} placeholder="e.g. Barista" maxLength={100} editable={!saving} /><ReferenceSelect label="Primary store" value={primaryStoreId} onChange={changePrimaryStore} items={stores} getItemId={(store) => store.id} renderItemLabel={(store) => store.name} placeholder="Select primary store" disabled={saving} /><View style={styles.additionalStores}><Text variant="label" color="textSecondary">Additional store assignments</Text><Text variant="caption" color="textMuted">Primary store cannot also be an additional assignment.</Text>{stores.filter((store) => store.id !== primaryStoreId).map((store) => <Checkbox key={store.id} value={additionalStoreIds.includes(store.id)} onValueChange={() => toggleAdditionalStore(store.id)} label={store.name} disabled={saving} />)}</View><View style={styles.actions}>{selected.counterOperatorEnabled ? <><Button label="Save Counter Settings" disabled={saving} onPress={saveCounterSettings} /><Button label="Disable Counter Operator" variant="outline" disabled={saving} onPress={() => Alert.alert("Disable Counter Operator?", "This disables Counter access but retains Organization Admin access.", [{ text: "Cancel", style: "cancel" }, { text: "Disable", style: "destructive", onPress: () => saveCounterOperator(false) }])} /></> : <Button label="Enable Counter Operator" disabled={saving} onPress={saveCounterSettings} />}</View></View>
          {selected.counterOperatorEnabled ? <View style={styles.section}><Text variant="h2" color="text">POS PIN</Text><Text variant="bodySmall" color="textMuted">{selected.posPinConfigured ? "A POS PIN is configured." : "No POS PIN is configured."}</Text><Button label={selected.posPinConfigured ? "Reset PIN" : "Set PIN"} disabled={saving} onPress={() => { setPin(""); setConfirmPin(""); setPinEntryVisible(true); }} /></View> : null}
          <Button label="Cancel" variant="secondary" disabled={saving} onPress={cancelEdit} />
        </>}
      </View> : null}
    </Modal>

    <Modal visible={pinEntryVisible} onClose={() => { if (!saving) { setPin(""); setConfirmPin(""); setPinEntryVisible(false); } }} title={selected?.posPinConfigured ? "Reset POS PIN" : "Set POS PIN"}>
      <View style={styles.modalContent}><Text variant="bodySmall" color="textMuted">Enter a new 4-digit PIN. The current PIN cannot be viewed or recovered.</Text><Input label="New 4-digit PIN" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))} secureTextEntry keyboardType="number-pad" maxLength={4} editable={!saving} /><Input label="Confirm PIN" value={confirmPin} onChangeText={(value) => setConfirmPin(value.replace(/\D/g, "").slice(0, 4))} secureTextEntry keyboardType="number-pad" maxLength={4} editable={!saving} /><Button label={selected?.posPinConfigured ? "Reset PIN" : "Set PIN"} disabled={saving} onPress={savePin} /><Button label="Cancel" variant="secondary" disabled={saving} onPress={() => { setPin(""); setConfirmPin(""); setPinEntryVisible(false); }} /></View>
    </Modal>

    <Modal visible={addUserVisible} onClose={() => { if (!saving) { setAddUserVisible(false); resetAddUser(); } }} title="Add Organization User" scrollable>
      <View style={styles.modalContent}>
        {mutationError ? <View style={styles.errorBox}><Text variant="bodySmall" color="danger">{mutationError}</Text></View> : null}
        <Text variant="bodySmall" color="textMuted">Add the user first, then grant Organization Admin or enable Counter Operator from their access record.</Text>
        <Input label="First name" value={newFirstName} onChangeText={setNewFirstName} editable={!saving} maxLength={100} />
        <Input label="Last name" value={newLastName} onChangeText={setNewLastName} editable={!saving} maxLength={100} />
        <Input label="Email" value={newEmail} onChangeText={setNewEmail} editable={!saving} keyboardType="email-address" maxLength={320} />
        <Input label="Phone" value={newPhone} onChangeText={setNewPhone} editable={!saving} placeholder="+14165550100" maxLength={20} keyboardType="phone-pad" />
        <Button label="Add User" disabled={saving} onPress={addUser} />
      </View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  screen: { padding: 24, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  headerText: { flex: 1, gap: 4 },
  headerActions: { flexDirection: "row", gap: 8 },
  cell: { gap: 2 },
  modalContent: { gap: 22, paddingBottom: 8 },
  summary: { gap: 3 },
  section: { gap: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 18 },
  additionalStores: { gap: 10 },
  actions: { gap: 10 },
  errorBox: { padding: 12, borderRadius: 8, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5" },
});
