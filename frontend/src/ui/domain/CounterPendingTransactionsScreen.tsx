import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type {
  CounterContext,
  CounterPendingTransaction,
} from "@/src/data/api/counter-api";
import { useTheme } from "@/src/providers";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Input,
  ReferenceSelect,
  StateView,
  Text,
} from "@/src/ui";

const PAGE_SIZE = 20;

const money = (amount?: number | null, currency?: string | null) =>
  amount == null || !currency ? "—" : `${currency} ${(amount / 100).toFixed(2)}`;

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

export function CounterPendingTransactionsScreen({
  context,
}: {
  context: CounterContext;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<CounterPendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The Counter recovery route is Store- and staff-scoped. This screen only
      // displays persisted state; it never creates or changes a payment attempt.
      setRows(await services.counter.pendingTransactions(context, 100, 0));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load pending transactions.",
      );
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(
    () => [...new Set(rows.map((row) => row.commerceStatus))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.commerceStatus !== status) return false;
      return !query ||
        [
          row.transactionNumber,
          row.customerDisplayName ?? "",
          row.commerceStatus,
          row.redemptionStatus,
          row.providerCode,
        ].some((value) => value.toLowerCase().includes(query));
    });
  }, [rows, search, status]);
  const visibleRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const canGoNext = (page + 1) * PAGE_SIZE < filtered.length;

  useEffect(() => {
    setPage(0);
  }, [search, status]);

  const resume = (row: CounterPendingTransaction) => {
    // Counter index performs the existing read-only checkout GET after routing.
    // No dispatch, retry, cancellation, or financial transition occurs here.
    const query = new URLSearchParams({
      organizationId: context.organizationId,
      storeId: context.storeId,
      staffId: context.staffId,
      resumeTransactionId: row.redemptionTransactionId,
    });
    router.push(`${APP_ROUTES.counter.root}?${query.toString()}` as never);
  };

  const columns = useMemo<DataTableColumn<CounterPendingTransaction>[]>(
    () => [
      {
        key: "transaction",
        title: "Transaction",
        width: 180,
        render: (row) => (
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong" color="text">
              {row.transactionNumber}
            </Text>
            <Text variant="caption" color="textMuted">
              {row.redemptionStatus}
            </Text>
          </View>
        ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 210,
        render: (row) => (
          <Text variant="body" color="text">
            {row.customerDisplayName ?? "Customer"}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Payment status",
        width: 210,
        render: (row) => (
          <View style={{ gap: 4 }}>
            <Badge
              label={label(row.commerceStatus)}
              tone={row.unresolvedPayment ? "warning" : "info"}
            />
            {row.lastAttemptStatus ? (
              <Text variant="caption" color="textMuted">
                Last attempt: {label(row.lastAttemptStatus)}
              </Text>
            ) : null}
          </View>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        width: 130,
        render: (row) => (
          <Text variant="body" color="text">
            {money(row.amountMinor, row.currencyCode)}
          </Text>
        ),
      },
      {
        key: "updated",
        title: "Last activity",
        width: 185,
        render: (row) => (
          <Text variant="bodySmall" color="textMuted">
            {new Date(row.lastAttemptAt ?? row.createdAt).toLocaleString()}
          </Text>
        ),
      },
    ],
    [],
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.lg,
        gap: theme.spacing.lg,
        maxWidth: 1500,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" color="text">
          Pending Transactions
        </Text>
        <Text variant="bodySmall" color="textMuted">
          Unresolved redemption payments for this Counter Store. Resume checks
          persisted status only; it never sends another terminal request.
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
        <Input
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Transaction number, customer, status"
        />
        <ReferenceSelect
          label="Payment status"
          value={status}
          allowClear
          placeholder="All statuses"
          items={statuses}
          onChange={setStatus}
          getItemId={(item) => item}
          renderItemLabel={label}
        />
      </View>
      {loading ? (
        <StateView kind="loading" title="Loading pending transactions" />
      ) : error ? (
        <StateView
          kind="error"
          title="Unable to load pending transactions"
          message={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={visibleRows}
            keyExtractor={(row) => row.redemptionTransactionId}
            emptyMessage="No pending transactions match these filters."
            actions={[{ label: "Resume", onPress: resume }]}
            minTableWidth={850}
            actionsWidth={110}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="bodySmall" color="textMuted">
              {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            </Text>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Button label="Previous" variant="secondary" disabled={page === 0} onPress={() => setPage((value) => Math.max(0, value - 1))} />
              <Button label="Next" variant="secondary" disabled={!canGoNext} onPress={() => setPage((value) => value + 1)} />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
