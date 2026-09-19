import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { services, type CountryReference, type Status } from "@/src/core";
import type { OrgAdminCustomer } from "@/src/data/api/org-admin-customer-api";
import { useBusiness } from "@/src/providers";
import { DataTable, type DataTableColumn, Input, Text } from "@/src/ui";
import { CustomerForm, type CustomerFormSubmitResult } from "@/src/ui/admin/CustomerForm";

function name(row: OrgAdminCustomer): string {
  return row.displayName?.trim() ||
    [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ") || row.userCode;
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text variant="caption" color="textMuted">{label}</Text><Text variant="body" color="text">{value}</Text></View>;
}

export default function OrgAdminCustomers() {
  const { organization } = useBusiness();
  return <OrganizationCustomers key={organization.id} organizationId={organization.id} />;
}

function OrganizationCustomers({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<OrgAdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrgAdminCustomer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null); setRows([]); setSelected(null);
    void services.orgAdminCustomers.list(organizationId)
      .then((data) => { if (current) setRows(data); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : "Unable to load customers."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organizationId, reload]);

  useEffect(() => {
    let current = true;
    setFormError(null);
    void Promise.all([services.referenceData.listCountries(), services.status.listUserStatuses()])
      .then(([countryData, statusData]) => { if (current) { setCountries(countryData); setStatuses(statusData); } })
      .catch((failure: unknown) => { if (current) setFormError(failure instanceof Error ? failure.message : "Unable to load customer form references."); });
    return () => { current = false; };
  }, [reload]);

  const activeUserStatusId = statuses.find((status) => status.statusCode.toUpperCase() === "ACTIVE")?.id;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => [name(row), row.primaryEmail, row.primaryPhone]
      .some((value) => value?.toLowerCase().includes(query))) : rows;
  }, [rows, search]);
  const existing = useMemo(() => filtered.filter((row) => row.subscriptionCount > 0), [filtered]);
  const prospects = useMemo(() => filtered.filter((row) => row.subscriptionCount === 0), [filtered]);

  const columns = useMemo<DataTableColumn<OrgAdminCustomer>[]>(() => [
    { key: "name", title: "Customer", width: 240, render: (row) => <View style={styles.customerCell}>
      <Text variant="bodyStrong" color="text">{name(row)}</Text>
      <Text variant="caption" color="textMuted">{row.subscriptionCount ? `Joined ${date(row.joiningDate)}` : "Prospective customer"}</Text>
    </View> },
    { key: "email", title: "Email", width: 240, render: (row) => <Text variant="body" color="text">{row.primaryEmail ?? "—"}</Text> },
    { key: "phone", title: "Phone", width: 180, render: (row) => <Text variant="body" color="text">{row.primaryPhone}</Text> },
    { key: "status", title: "Status", width: 140, render: (row) => <Text variant="body" color="text">{row.relationshipStatusName}</Text> },
    { key: "membership", title: "Membership", width: 220, render: (row) => <Text variant="body" color="text">{row.membershipName ?? "No membership"}</Text> },
  ], []);

  async function saveProspect(result: CustomerFormSubmitResult): Promise<void> {
    setSaving(true);
    try {
      const phone = `${result.user.primaryPhone.callingCode ?? ""}${result.user.primaryPhone.number}`.replace(/[\s()-]/g, "");
      await services.orgAdminCustomers.createProspect(organizationId, {
        firstName: result.user.firstName,
        middleName: result.user.middleName,
        lastName: result.user.lastName,
        displayName: result.user.displayName,
        primaryEmail: result.user.primaryEmail,
        primaryPhone: phone,
      });
      setShowForm(false);
      setMessage("Prospective customer saved.");
      setReload((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">Customers</Text>
          <Text variant="bodySmall" color="textMuted">Manage customers and prospective customers associated with your organization.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} disabled={loading} onPress={() => setReload((value) => value + 1)}><Text variant="body" color="text">Reload</Text></Pressable>
          <Pressable style={styles.primaryButton} disabled={saving || !!formError || !activeUserStatusId || countries.length === 0}
            onPress={() => { setMessage(""); setShowForm(true); }}><Text variant="body" color="background">+ Add Prospective Customer</Text></Pressable>
        </View>
      </View>
      {message ? <View style={styles.successBox}><Text variant="body" color="text">{message}</Text></View> : null}
      {formError ? <Text variant="body" color="text">{formError}</Text> : null}
      <View style={styles.searchContainer}>
        <Text variant="label" color="textSecondary">Search Customers</Text>
        <Input value={search} onChangeText={setSearch} placeholder="Search by name, email or phone" />
      </View>
      {loading ? <View style={styles.center}><Text variant="body" color="textMuted">Loading customers...</Text></View>
        : error ? <View style={styles.center}><Text variant="body" color="text">{error}</Text></View>
        : <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View style={styles.headerText}>
              <Text variant="h2" color="text">Existing Customers</Text>
              <Text variant="bodySmall" color="textMuted">Customers with membership purchase or membership history.</Text>
            </View><Text variant="label" color="primary">{existing.length}</Text></View>
            <DataTable columns={columns} data={existing} keyExtractor={(row) => row.organizationUserId}
              emptyMessage={search.trim() ? "No existing customers match your search." : "No existing customers associated with this organization."}
              actions={[{ label: "View", onPress: setSelected }]} />
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View style={styles.headerText}>
              <Text variant="h2" color="text">Prospective Customers</Text>
              <Text variant="bodySmall" color="textMuted">Customers associated with the organization who have not purchased a membership yet.</Text>
            </View><Text variant="label" color="primary">{prospects.length}</Text></View>
            <DataTable columns={columns} data={prospects} keyExtractor={(row) => row.organizationUserId}
              emptyMessage={search.trim() ? "No prospective customers match your search." : "No prospective customers found."}
              actions={[{ label: "View", onPress: setSelected }]} />
          </View>
        </>}
    </ScrollView>
    <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => { if (!saving) setShowForm(false); }}>
      <View style={styles.overlay}><View style={styles.formModal}>
        <View style={styles.modalHeader}><View><Text variant="h2" color="text">Add Prospective Customer</Text>
          <Text variant="bodySmall" color="textMuted">The customer is added after the server confirms the save.</Text></View>
          <Pressable disabled={saving} onPress={() => setShowForm(false)}><Text variant="body" color="textMuted">✕</Text></Pressable></View>
        {activeUserStatusId ? <ScrollView><CustomerForm organizationId={organizationId} stores={[]}
          countries={countries} userStatuses={statuses} activeUserStatusId={activeUserStatusId}
          hideAcquisitionSection hideUserStatusSection onSave={saveProspect} onCancel={() => setShowForm(false)} /></ScrollView> : null}
      </View></View>
    </Modal>
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      {selected && <View style={styles.overlay}><View style={styles.viewModal}>
        <View style={styles.modalHeader}><View><Text variant="h2" color="text">{name(selected)}</Text>
          <Text variant="bodySmall" color="textMuted">{selected.subscriptionCount ? "Existing Customer" : "Prospective Customer"}</Text></View>
          <Pressable onPress={() => setSelected(null)}><Text variant="body" color="textMuted">✕</Text></Pressable></View>
        <ScrollView><View style={styles.detailsGrid}>
          <Detail label="First Name" value={selected.firstName} />
          <Detail label="Middle Name" value={selected.middleName ?? "—"} />
          <Detail label="Last Name" value={selected.lastName ?? "—"} />
          <Detail label="Display Name" value={name(selected)} />
          <Detail label="User Code" value={selected.userCode} />
          <Detail label="Email" value={selected.primaryEmail ?? "—"} />
          <Detail label="Phone" value={selected.primaryPhone} />
          <Detail label="User Status" value={selected.userStatusName} />
          <Detail label="Relationship Status" value={selected.relationshipStatusName} />
          <Detail label="Joined" value={date(selected.joiningDate)} />
          <Detail label="Organization User ID" value={selected.organizationUserId} />
          <Detail label="Subscriptions" value={String(selected.subscriptionCount)} />
          <Detail label="Membership" value={selected.membershipName ?? "No membership"} />
        </View><Pressable style={styles.secondaryButton} onPress={() => setSelected(null)}><Text variant="body" color="text">Close</Text></Pressable></ScrollView>
      </View></View>}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 }, screen: { padding: 24, gap: 28 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  headerText: { flex: 1, gap: 4 }, headerActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  primaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#0F766E" },
  secondaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D1D5DB" },
  successBox: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  searchContainer: { gap: 8, maxWidth: 500 }, section: { gap: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  customerCell: { gap: 2 }, center: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  formModal: { width: "100%", maxWidth: 760, maxHeight: "90%", backgroundColor: "#FFFFFF", borderRadius: 12, padding: 24, gap: 24 },
  viewModal: { width: "100%", maxWidth: 620, maxHeight: "90%", backgroundColor: "#FFFFFF", borderRadius: 12, padding: 24, gap: 24 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  detailsGrid: { gap: 16, paddingBottom: 20 }, detail: { gap: 3 },
});
