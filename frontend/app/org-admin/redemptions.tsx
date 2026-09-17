import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { services } from "@/src/core";
import type { OrgAdminRedemption } from "@/src/data/api/org-admin-transaction-api";
import { useBusiness } from "@/src/providers";
import { DataTable, type DataTableColumn, Input, Text } from "@/src/ui";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text variant="caption" color="textMuted">{label}</Text><Text variant="body" color="text">{value}</Text></View>;
}

export default function OrgAdminRedemptions() {
  const { organization } = useBusiness();
  return <OrganizationRedemptions key={organization.id} organizationId={organization.id} />;
}

function OrganizationRedemptions({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<OrgAdminRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrgAdminRedemption | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null); setRows([]); setSelected(null);
    void services.orgAdminTransactions.listRedemptions(organizationId)
      .then((data) => { if (current) setRows(data); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : "Unable to load redemptions."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organizationId, reload]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => [row.redemptionNumber, row.id, row.subscriptionNumber,
      row.customerName, row.customerEmail, row.customerPhone, row.benefitName, row.benefitCode,
      row.storeName, row.storeCode, row.staffName, row.staffCode, row.statusCode, row.statusName]
      .some((value) => value?.toLowerCase().includes(query))) : rows;
  }, [rows, search]);

  const columns = useMemo<DataTableColumn<OrgAdminRedemption>[]>(() => [
    { key: "redemption", title: "Redemption", width: 155, render: (row) => <Text variant="bodyStrong" color="text" numberOfLines={1}>{row.redemptionNumber}</Text> },
    { key: "customer", title: "Customer", width: 140, render: (row) => <Text variant="body" color="text" numberOfLines={1}>{row.customerName}</Text> },
    { key: "subscription", title: "Subscription", width: 150, render: (row) => <Text variant="body" color="text" numberOfLines={1}>{row.subscriptionNumber}</Text> },
    { key: "benefit", title: "Benefit", width: 190, render: (row) => <Text variant="body" color="text" numberOfLines={2}>{row.benefitName}</Text> },
    { key: "store", title: "Store", width: 175, render: (row) => <Text variant="body" color="text" numberOfLines={2}>{row.storeName}</Text> },
    { key: "staff", title: "Staff", width: 175, render: (row) => <Text variant="body" color="text" numberOfLines={2}>{row.staffName ?? "—"}</Text> },
    { key: "date", title: "Date", width: 150, render: (row) => <Text variant="body" color="text" numberOfLines={2}>{formatDateTime(row.redemptionDateTime)}</Text> },
    { key: "status", title: "Status", width: 110, render: (row) => <Text variant="body" color="text" numberOfLines={1}>{row.statusName}</Text> },
  ], []);

  return <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text variant="title" color="text">Redemptions</Text>
        <Text variant="bodySmall" color="textMuted">View benefit redemption transactions for your organization.</Text>
        <Pressable disabled={loading} onPress={() => setReload((value) => value + 1)}><Text variant="bodySmall" color="text">Reload</Text></Pressable>
      </View>
      <View style={styles.summary}>
        <View style={styles.summaryCard}><Text variant="caption" color="textMuted">Total Redemptions</Text><Text variant="h2" color="text">{rows.length}</Text></View>
        <View style={styles.summaryCard}><Text variant="caption" color="textMuted">Successful</Text><Text variant="h2" color="text">{rows.filter((row) => row.statusCode.toUpperCase() === "SUCCESS").length}</Text></View>
      </View>
      <Input label="Search Redemptions" value={search} onChangeText={setSearch} placeholder="Search redemption, customer, benefit, subscription or status" />
      {loading ? <View style={styles.center}><Text variant="body" color="textMuted">Loading redemptions...</Text></View>
        : error ? <View style={styles.center}><Text variant="body" color="text">{error}</Text></View>
        : <DataTable columns={columns} data={filtered} keyExtractor={(row) => row.id}
            emptyMessage={search.trim() ? "No redemptions match your search." : "No redemptions found for this organization."}
            actions={[{ label: "View", onPress: setSelected }]} minTableWidth={1500} />}
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      {selected && <View style={styles.overlay}><View style={styles.modal}>
        <View style={styles.modalHeader}><View><Text variant="h2" color="text">{selected.redemptionNumber}</Text><Text variant="bodySmall" color="textMuted">Redemption transaction details</Text></View><Pressable onPress={() => setSelected(null)}><Text variant="body" color="textMuted">✕</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalContent}><View style={styles.detailsGrid}>
          <Detail label="Redemption Number" value={selected.redemptionNumber} />
          <Detail label="Redemption ID" value={selected.id} />
          <Detail label="Subscription" value={selected.subscriptionNumber} />
          <Detail label="Subscription ID" value={selected.subscriptionId} />
          <Detail label="Customer" value={selected.customerName} />
          <Detail label="Customer Email" value={selected.customerEmail ?? "—"} />
          <Detail label="Customer Phone" value={selected.customerPhone} />
          <Detail label="Benefit" value={selected.benefitName} />
          <Detail label="Benefit Code" value={selected.benefitCode} />
          <Detail label="Benefit ID" value={selected.benefitId} />
          <Detail label="Store" value={selected.storeName} />
          <Detail label="Store Code" value={selected.storeCode} />
          <Detail label="Store ID" value={selected.storeId} />
          <Detail label="Staff" value={selected.staffName ?? "—"} />
          <Detail label="Staff Code" value={selected.staffCode ?? "—"} />
          <Detail label="Staff ID" value={selected.staffId ?? "—"} />
          <Detail label="Redemption Date & Time" value={formatDateTime(selected.redemptionDateTime)} />
          <Detail label="Quantity" value={String(selected.quantity)} />
          <Detail label="Method" value="Not recorded" />
          <Detail label="Status" value={selected.statusName} />
          <Detail label="Status Code" value={selected.statusCode} />
          <Detail label="Status ID" value={selected.redemptionStatusId} />
          <Detail label="Remarks" value={selected.remarks ?? "—"} />
          <Detail label="Created At" value={formatDateTime(selected.createdAt)} />
          <Detail label="Created By" value={selected.createdBy} />
          <Detail label="Updated At" value={formatDateTime(selected.updatedAt)} />
          <Detail label="Updated By" value={selected.updatedBy} />
          <Detail label="Version" value={String(selected.versionNo)} />
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
