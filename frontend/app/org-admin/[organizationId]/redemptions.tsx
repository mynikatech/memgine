import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useBusiness } from "@/src/providers";
import { DataTable, Input, Text, type DataTableColumn } from "@/src/ui";
import {
  redemptionResolutionApi,
  type RedemptionResolutionCandidate,
} from "@/src/data/api/redemption-resolution-api";
import { RedemptionDetails } from "@/src/ui/domain/RedemptionDetails";

const date = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};
const paid = (row: RedemptionResolutionCandidate) =>
  (row.paymentAmountMinor ?? 0) > 0
    ? `${row.currencyCode ?? ""} ${((row.paymentAmountMinor ?? 0) / 100).toFixed(2)}`
    : "No charge";

export default function OrgAdminRedemptions() {
  const { organization } = useBusiness();
  return (
    <RedemptionsByOrganization
      key={organization.id}
      organizationId={organization.id}
    />
  );
}
function RedemptionsByOrganization({
  organizationId,
}: {
  organizationId: string;
}) {
  const [rows, setRows] = useState<RedemptionResolutionCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await redemptionResolutionApi.candidates(organizationId);
      if (!result.success)
        throw new Error(result.error?.message ?? "Unable to load redemptions");
      setRows(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        !term ||
        [
          row.customerName,
          row.customerEmail,
          row.customerPhone,
          row.subscriptionNumber,
          row.redemptionNumber,
          row.itemName,
          row.itemType,
          row.itemStatus,
          row.storeName,
          row.transactionId,
        ].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [rows, query]);
  const selected = rows.find((row) => row.itemId === selectedId) ?? null;
  const columns = useMemo<DataTableColumn<RedemptionResolutionCandidate>[]>(
    () => [
      {
        key: "redemption",
        title: "Redemption",
        width: 165,
        render: (row) => (
          <Text variant="bodyStrong" color="text">
            {row.redemptionNumber}
          </Text>
        ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 200,
        render: (row) => (
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong" color="text">
              {row.customerName}
            </Text>
            <Text variant="caption" color="textMuted">
              {row.customerPhone || row.customerEmail || "—"}
            </Text>
          </View>
        ),
      },
      {
        key: "membership",
        title: "Subscription",
        width: 140,
        render: (row) => (
          <Text variant="body" color="text">
            {row.subscriptionNumber || "—"}
          </Text>
        ),
      },
      {
        key: "item",
        title: "Benefit / Offer",
        width: 215,
        render: (row) => (
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong" color="text">
              {row.itemName}
            </Text>
            <Text variant="caption" color="textMuted">
              {row.itemType}
            </Text>
          </View>
        ),
      },
      {
        key: "date",
        title: "Redeemed",
        width: 175,
        render: (row) => (
          <Text variant="body" color="text">
            {date(row.redeemedAt)}
          </Text>
        ),
      },
      {
        key: "payment",
        title: "Payment",
        width: 125,
        render: (row) => (
          <Text variant="body" color="text">
            {paid(row)}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 125,
        render: (row) => (
          <Text variant="body" color="text">
            {row.itemStatus}
          </Text>
        ),
      },
    ],
    [],
  );
  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 6 }}>
          <Text variant="title" color="text">
            Redemptions
          </Text>
          <Text variant="bodySmall" color="textMuted">
            Benefits and offers redeemed across your organization. Select View
            to inspect or resolve a specific redemption.
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          <View style={styles.stat}>
            <Text variant="caption" color="textMuted">
              Total items
            </Text>
            <Text variant="h2" color="text">
              {rows.length}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="caption" color="textMuted">
              Currently consumed
            </Text>
            <Text variant="h2" color="text">
              {rows.filter((row) => row.itemStatus === "SUCCESS").length}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="caption" color="textMuted">
              Restored
            </Text>
            <Text variant="h2" color="text">
              {rows.filter((row) => row.itemStatus === "REVERSED").length}
            </Text>
          </View>
        </View>
        <Input
          label="Search redemptions"
          placeholder="Customer, phone, subscription, offer, transaction..."
          value={query}
          onChangeText={setQuery}
        />
        <Pressable
          onPress={() => {
            void load();
          }}
          disabled={loading}
        >
          <Text variant="bodySmall" color="text">
            Reload
          </Text>
        </Pressable>
        {loading && (
          <Text variant="bodySmall" color="textMuted">
            Loading redemptions...
          </Text>
        )}
        {!!error && (
          <Text variant="bodySmall" color="text">
            {error}
          </Text>
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(row) => row.itemId}
            emptyMessage={
              query
                ? "No redemptions match this search."
                : "No completed redemptions found."
            }
            actions={[
              { label: "View", onPress: (row) => setSelectedId(row.itemId) },
            ]}
            minTableWidth={1350}
          />
        )}
      </ScrollView>
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedId(null)}
      >
        {!!selected && (
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text variant="h2" color="text">
                  Redemption Details
                </Text>
                <Pressable onPress={() => setSelectedId(null)}>
                  <Text variant="bodyStrong" color="text">
                    Close ×
                  </Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <RedemptionDetails
                  organizationId={organizationId}
                  item={selected}
                  onChanged={() => {
                    void load();
                  }}
                />
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  screen: { padding: 18, gap: 18 },
  stat: {
    minWidth: 165,
    borderWidth: 1,
    borderColor: "#d6dce2",
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: "white",
    width: "94%",
    maxWidth: 950,
    maxHeight: "92%",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#d6dce2",
  },
});
