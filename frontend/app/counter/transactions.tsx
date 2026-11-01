import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { APP_ROUTES } from "@/src/constants/navigation";
import { CounterApi, type CounterContext } from "@/src/data/api/counter-api";
import type {
  TransactionHistoryItem,
  TransactionReceipt,
} from "@/src/data/api/customer-data-api";
import { TransactionReceiptViewer } from "@/src/ui/domain/TransactionReceiptViewer";
import {
  transactionSummary,
  transactionReceiptCaption,
  transactionTypeLabel,
  transactionStatusLabel,
  transactionPaymentLabel,
} from "@/src/ui/domain/transaction-history-display";
import { Button, Header, StateView, Text } from "@/src/ui";
import { Screen } from "@/src/layout";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import { useBusiness } from "@/src/providers";

const api = new CounterApi();

type CounterHistoryItem = TransactionHistoryItem & {
  /** Optional authorised field; older backend versions do not supply it. */
  customerDisplayName?: string | null;
};

const formatMoney = (minor: number, currency: string) => {
  try {
    return `${currency} ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100)}`;
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
};

const readableDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
};

const rowKey = (row: TransactionHistoryItem) =>
  `${row.transactionType}:${row.transactionId}`;

export default function CounterTransactionsRoute() {
  const router = useRouter();
  const { organization } = useBusiness();
  const { context } = useCounterSession();
  const params = useLocalSearchParams<{
    organizationId?: string;
    storeId?: string;
    staffId?: string;
    customerUserId?: string;
  }>();
  const organizationId = params.organizationId ?? organization.id;
  const validContext: CounterContext | null =
    context?.organizationId === organizationId &&
    (!params.storeId || context.storeId === params.storeId) &&
    (!params.staffId || context.staffId === params.staffId)
      ? context
      : null;

  const [rows, setRows] = useState<CounterHistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!validContext) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.transactions(validContext, {
        customerUserId: params.customerUserId,
        search: query.trim() || undefined,
      });
      if (result.success) {
        setRows(result.data);
        setExpandedId(null);
      } else {
        setError(result.error.message);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load transactions",
      );
    } finally {
      setLoading(false);
    }
  }, [validContext, params.customerUserId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!validContext) {
      router.replace(APP_ROUTES.counter.organization(organizationId) as never);
    }
  }, [organizationId, router, validContext]);

  const viewReceipt = async (id: string) => {
    if (!validContext || receiptLoadingId) return;
    setReceiptError(null);
    setReceiptLoadingId(id);
    try {
      const result = await api.receipt(validContext, id);
      if (result.success) setReceipt(result.data);
      else setReceiptError(result.error.message);
    } catch (cause) {
      setReceiptError(
        cause instanceof Error ? cause.message : "Unable to load receipt",
      );
    } finally {
      setReceiptLoadingId(null);
    }
  };

  if (!validContext) return null;

  return (
    <Screen scroll={false}>
      <View style={styles.root}>
        <Header
          title={
            params.customerUserId
              ? "Customer Transaction History"
              : "Transactions"
          }
          subtitle="Store-scoped transaction history"
        />
        <View style={styles.filters}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void load()}
            placeholder="Search transaction or receipt"
            style={styles.input}
            returnKeyType="search"
          />
          <Button
            label="Search"
            variant="secondary"
            onPress={() => void load()}
          />
        </View>
        {loading ? (
          <StateView kind="loading" title="Loading transactions" />
        ) : error ? (
          <StateView
            kind="error"
            title="Transactions unavailable"
            message={error}
            actionLabel="Retry"
            onAction={() => void load()}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {rows.length ? (
              rows.map((row) => {
                const key = rowKey(row);
                const expanded = expandedId === key;
                const customerName = row.customerDisplayName?.trim();
                const paymentLabel = transactionPaymentLabel(row.paymentMethod);
                const statusLabel = transactionStatusLabel(row.status);
                const caption = transactionReceiptCaption(row);
                return (
                  <View key={key} style={styles.item}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${row.transactionNumber}, ${customerName ?? "customer not named"}, ${formatMoney(row.totalMinor, row.currencyCode)}. ${expanded ? "Collapse details" : "Expand details"}`}
                      accessibilityState={{ expanded }}
                      onPress={() => {
                        setExpandedId(expanded ? null : key);
                        setReceiptError(null);
                      }}
                      style={({ pressed }) => [
                        styles.compactRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={expanded ? "chevron-down" : "chevron-forward"}
                        size={19}
                        color="#64748B"
                      />
                      <View style={styles.rowMain}>
                        <Text variant="bodyStrong">
                          {row.transactionNumber}
                        </Text>
                        {customerName ? (
                          <View style={styles.customerLine}>
                            <Ionicons
                              name="person-outline"
                              size={13}
                              color="#64748B"
                            />
                            <Text variant="bodySmall" color="textMuted">
                              {customerName}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.amountBlock}>
                        <Text variant="bodyStrong">
                          {formatMoney(row.totalMinor, row.currencyCode)}
                        </Text>
                        {statusLabel ? (
                          <Text variant="caption" color="textMuted">
                            {statusLabel}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {expanded ? (
                      <View style={styles.details}>
                        <View style={styles.detailRow}>
                          <Text variant="bodySmall" color="textMuted">
                            Customer
                          </Text>
                          <Text variant="bodySmall">
                            {customerName || "Name not available"}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text variant="bodySmall" color="textMuted">
                            Store
                          </Text>
                          <Text variant="bodySmall">
                            {row.storeName || "Store not recorded"}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text variant="bodySmall" color="textMuted">
                            Date / time
                          </Text>
                          <Text variant="bodySmall">
                            {readableDate(row.occurredAt)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text variant="bodySmall" color="textMuted">
                            Type
                          </Text>
                          <Text variant="bodySmall">
                            {transactionTypeLabel(row.transactionType)}
                          </Text>
                        </View>
                        {paymentLabel ? (
                          <View style={styles.detailRow}>
                            <Text variant="bodySmall" color="textMuted">
                              Payment
                            </Text>
                            <Text variant="bodySmall">{paymentLabel}</Text>
                          </View>
                        ) : null}
                        <View style={styles.detailRow}>
                          <Text variant="bodySmall" color="textMuted">
                            Summary
                          </Text>
                          <Text variant="bodySmall">
                            {transactionSummary(row)}
                          </Text>
                        </View>
                        <View style={styles.receiptAction}>
                          {row.receiptAvailable && row.receiptId ? (
                            <Button
                              label={
                                receiptLoadingId === row.receiptId
                                  ? "Loading receipt..."
                                  : "View / Print Receipt"
                              }
                              onPress={() => void viewReceipt(row.receiptId!)}
                              disabled={receiptLoadingId !== null}
                            />
                          ) : caption ? (
                            <Text variant="caption" color="textMuted">
                              {caption}
                            </Text>
                          ) : null}
                        </View>
                        {receiptError ? (
                          <Text variant="bodySmall" color="textMuted">
                            {receiptError}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <StateView
                kind="empty"
                title="No transactions found"
                message="Try another search or check a different Store."
              />
            )}
          </ScrollView>
        )}
        <TransactionReceiptViewer
          receipt={receipt}
          visible={receipt !== null}
          onClose={() => setReceipt(null)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12, padding: 16 },
  filters: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  list: { paddingBottom: 24, gap: 1 },
  item: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 6,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 58,
  },
  pressed: { backgroundColor: "#F8FAFC" },
  rowMain: { flex: 1, gap: 3 },
  customerLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  amountBlock: { alignItems: "flex-end", gap: 3 },
  details: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FAFBFC",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  receiptAction: { alignItems: "flex-end", marginTop: 6 },
});
