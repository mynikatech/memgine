import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { services } from "@/src/core";
import type { OrgAdminSubscription } from "@/src/data/api/org-admin-transaction-api";
import { useBusiness } from "@/src/providers";
import { DataTable, type DataTableColumn, Input, Text } from "@/src/ui";

const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};
const money = (row: OrgAdminSubscription) => `${row.currencyCode} ${row.totalAmount.toFixed(2)}`;

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text variant="caption" color="textMuted">{label}</Text><Text variant="body" color="text">{value}</Text></View>;
}

export default function OrgAdminSubscriptions() {
  const { organization } = useBusiness();
  return <OrganizationSubscriptions key={organization.id} organizationId={organization.id} />;
}

function OrganizationSubscriptions({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<OrgAdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrgAdminSubscription | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null); setRows([]); setSelected(null);
    void services.orgAdminTransactions.listSubscriptions(organizationId)
      .then((data) => { if (current) setRows(data); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : "Unable to load subscriptions."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organizationId, reload]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => [row.subscriptionNumber, row.id, row.customerName,
      row.customerEmail, row.customerPhone, row.subscriptionPlanName, row.subscriptionPlanCode,
      row.membershipProductName, row.statusName].some((value) => value?.toLowerCase().includes(query))) : rows;
  }, [rows, search]);

  const columns = useMemo<DataTableColumn<OrgAdminSubscription>[]>(() => [
    { key: "subscription", title: "Subscription", width: 220, render: (row) => <View><Text variant="bodyStrong" color="text">{row.subscriptionNumber}</Text><Text variant="caption" color="textMuted">ID: {row.id}</Text></View> },
    { key: "customer", title: "Customer", width: 220, render: (row) => <View><Text variant="body" color="text">{row.customerName}</Text><Text variant="caption" color="textMuted">{row.customerEmail ?? row.customerPhone}</Text></View> },
    { key: "plan", title: "Subscription Plan", width: 220, render: (row) => <View><Text variant="body" color="text">{row.subscriptionPlanName}</Text><Text variant="caption" color="textMuted">{row.membershipProductName}</Text></View> },
    { key: "purchase", title: "Purchase Date", width: 140, render: (row) => <Text variant="body" color="text">{date(row.subscriptionDate)}</Text> },
    { key: "start", title: "Start Date", width: 140, render: (row) => <Text variant="body" color="text">{date(row.startDate)}</Text> },
    { key: "end", title: "End Date", width: 140, render: (row) => <Text variant="body" color="text">{date(row.endDate)}</Text> },
    { key: "status", title: "Status", width: 150, render: (row) => <Text variant="body" color="text">{row.statusName}</Text> },
    { key: "amount", title: "Amount", width: 140, render: (row) => <Text variant="body" color="text">{money(row)}</Text> },
  ], []);

  return <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text variant="title" color="text">Subscriptions</Text>
        <Text variant="bodySmall" color="textMuted">View subscriptions purchased by customers of your organization.</Text>
        <Pressable disabled={loading} onPress={() => setReload((value) => value + 1)}><Text variant="bodySmall" color="text">Reload</Text></Pressable>
      </View>
      <View style={styles.summary}>
        <View style={styles.summaryCard}><Text variant="caption" color="textMuted">Total Subscriptions</Text><Text variant="h2" color="text">{rows.length}</Text></View>
        <View style={styles.summaryCard}><Text variant="caption" color="textMuted">Active</Text><Text variant="h2" color="text">{rows.filter((row) => row.statusCode.toUpperCase() === "ACTIVE").length}</Text></View>
      </View>
      <Input label="Search Subscriptions" value={search} onChangeText={setSearch} placeholder="Search customer, subscription, plan or status" />
      {loading ? <View style={styles.center}><Text variant="body" color="textMuted">Loading subscriptions...</Text></View>
        : error ? <View style={styles.center}><Text variant="body" color="text">{error}</Text></View>
        : <DataTable columns={columns} data={filtered} keyExtractor={(row) => row.id}
            emptyMessage={search.trim() ? "No subscriptions match your search." : "No subscriptions found for this organization."}
            actions={[{ label: "View", onPress: setSelected }]} />}
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      {selected && <View style={styles.overlay}><View style={styles.modal}>
        <View style={styles.modalHeader}><View><Text variant="h2" color="text">{selected.subscriptionNumber}</Text><Text variant="bodySmall" color="textMuted">Subscription details</Text></View><Pressable onPress={() => setSelected(null)}><Text variant="body" color="textMuted">✕</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalContent}><View style={styles.detailsGrid}>
          <Detail label="Customer" value={selected.customerName} />
          <Detail label="Customer Email" value={selected.customerEmail ?? "—"} />
          <Detail label="Customer Phone" value={selected.customerPhone} />
          <Detail label="Organization User ID" value={selected.organizationUserId} />
          <Detail label="Subscription Plan" value={selected.subscriptionPlanName} />
          <Detail label="Plan Code" value={selected.subscriptionPlanCode} />
          <Detail label="Membership Product" value={selected.membershipProductName} />
          <Detail label="Purchase Date" value={date(selected.subscriptionDate)} />
          <Detail label="Start Date" value={date(selected.startDate)} />
          <Detail label="End Date" value={date(selected.endDate)} />
          <Detail label="Status" value={selected.statusName} />
          <Detail label="Total Amount" value={money(selected)} />
          <Detail label="Created At" value={selected.createdAt} />
        </View><Pressable style={styles.close} onPress={() => setSelected(null)}><Text variant="body" color="text">Close</Text></Pressable></ScrollView>
      </View></View>}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 }, screen: { padding: 18, gap: 18 }, header: { gap: 4 },
  summary: { flexDirection: "row", gap: 16 },
  summaryCard: { width: 190, minHeight: 90, borderWidth: 1, borderColor: "#d6dce2", borderRadius: 10, padding: 16, gap: 8 },
  center: { padding: 40, alignItems: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { width: "90%", maxWidth: 900, maxHeight: "88%", backgroundColor: "white", borderRadius: 12, overflow: "hidden" },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#e1e5e9", flexDirection: "row", justifyContent: "space-between" },
  modalContent: { padding: 20, gap: 20 }, detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  detail: { minWidth: 240, flexGrow: 1, gap: 4 },
  close: { borderWidth: 1, borderColor: "#d6dce2", borderRadius: 8, padding: 12, alignItems: "center" },
});
