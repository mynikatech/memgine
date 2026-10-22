import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useBusiness, useTheme } from "@/src/providers";
import {
  transactionInvestigationApi,
  type InvestigatedPayment,
} from "@/src/data/api/transaction-investigation-api";
import { DataTable, Input, Text, type DataTableColumn } from "@/src/ui";

const money = (minor: number, code: string) =>
  `${code} ${(minor / 100).toFixed(2)}`;

// Date grouping uses the device/browser's local timezone until the organization's
// business timezone is exposed explicitly by the organization context.
const dayKey = (dateValue: string): string => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dayLabel = (key: string): string => {
  if (key === "Unknown date") return key;
  const date = new Date(`${key}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const stamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const clock = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
};

const isSucceeded = (status: string): boolean =>
  status.toUpperCase() === "SUCCEEDED";

const statusLabel = (value: string | null | undefined): string =>
  (value || "Unknown").replaceAll("_", " ");

type Totals = {
  count: number;
  successfulCount: number;
  paid: number;
  refunded: number;
  pendingRefund: number;
  net: number;
};

const totalFor = (rows: InvestigatedPayment[]): Map<string, Totals> => {
  const result = new Map<string, Totals>();
  for (const row of rows) {
    const currency = row.currencyCode;
    const previous = result.get(currency) || {
      count: 0,
      successfulCount: 0,
      paid: 0,
      refunded: 0,
      pendingRefund: 0,
      net: 0,
    };
    previous.count += 1;
    if (isSucceeded(row.paymentStatus)) {
      previous.successfulCount += 1;
      previous.paid += row.amountMinor;
    }
    previous.refunded += row.refundedMinor ?? 0;
    previous.pendingRefund += row.reservedRefundMinor ?? 0;
    previous.net = previous.paid - previous.refunded;
    result.set(currency, previous);
  }
  return result;
};

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 190, minWidth: 0, gap: 5 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text">
        {value == null || value === "" ? "Not recorded" : String(value)}
      </Text>
    </View>
  );
}

export default function Transactions() {
  const { organization } = useBusiness();
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [rows, setRows] = useState<InvestigatedPayment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<InvestigatedPayment | null>(null);
  const [reload, setReload] = useState(0);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void transactionInvestigationApi
      .payments(organization.id)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error.message);
        setRows(result.data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Unable to load payments",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [organization.id, reload]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((r) =>
      [
        r.paymentIntentId,
        r.customerName,
        r.customerUserId,
        r.providerCode,
        r.providerReference,
        r.paymentStatus,
        r.subscriptionId,
        r.financialExceptionId,
        r.storeId,
        r.staffId,
      ].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [rows, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, InvestigatedPayment[]>();
    for (const row of filtered) {
      const key = dayKey(row.createdAt);
      const group = groups.get(key) || [];
      group.push(row);
      groups.set(key, group);
    }
    return Array.from(groups, ([date, payments]) => ({
      date,
      payments: payments.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
      totals: totalFor(payments),
    })).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const overall = useMemo(() => totalFor(filtered), [filtered]);

  const columns = useMemo<DataTableColumn<InvestigatedPayment>[]>(
    () => [
      {
        key: "time",
        title: "Time",
        width: 100,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {clock(r.createdAt)}
          </Text>
        ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 190,
        render: (r) => (
          <Text variant="body" color="text">
            {r.customerName ?? r.customerUserId ?? "Not recorded"}
          </Text>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        width: 130,
        render: (r) => (
          <Text variant="bodyStrong" color="text">
            {money(r.amountMinor, r.currencyCode)}
          </Text>
        ),
      },
      {
        key: "payment",
        title: "Payment status",
        width: 140,
        render: (r) => (
          <Text
            variant="bodySmall"
            color={isSucceeded(r.paymentStatus) ? "success" : "text"}
          >
            {statusLabel(r.paymentStatus)}
          </Text>
        ),
      },
      {
        key: "provider",
        title: "Provider",
        width: 155,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {r.providerCode}
          </Text>
        ),
      },
      {
        key: "source",
        title: "Source",
        width: 150,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {statusLabel(r.authorizationMode)}
          </Text>
        ),
      },
      {
        key: "subscription",
        title: "Membership",
        width: 115,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {r.subscriptionId ? "Linked" : "Not linked"}
          </Text>
        ),
      },
      {
        key: "refund",
        title: "Refunded",
        width: 125,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {money(r.refundedMinor ?? 0, r.currencyCode)}
          </Text>
        ),
      },
    ],
    [],
  );

  const border = theme.colors.border;
  const surface = theme.colors.surface;
  const surfaceAlt = theme.colors.surfaceAlt;

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, gap: 18 }}
      >
        <View style={{ gap: 6 }}>
          <Text variant="title" color="text">
            Transaction investigation
          </Text>
          <Text variant="bodySmall" color="textMuted">
            Date-wise totals for listed payment intents only. Commerce-only
            remote/terminal payments and redemptions are not yet included; this
            is not a complete ledger.
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <View style={{ flex: 1, minWidth: 220 }}>
            <Input
              label="Search transactions"
              value={query}
              onChangeText={setQuery}
              placeholder="Customer, reference, status or subscription"
            />
          </View>
          <Pressable
            onPress={() => setReload((n) => n + 1)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Reload transactions"
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: border,
              borderRadius: 8,
            }}
          >
            <Text variant="bodyStrong" color="text">
              Reload
            </Text>
          </Pressable>
        </View>

        {busy ? (
          <Text variant="body" color="textMuted">
            Loading transactions…
          </Text>
        ) : error ? (
          <Text variant="body" color="danger">
            {error}
          </Text>
        ) : (
          <>
            <View style={{ gap: 10 }}>
              <Text variant="h3" color="text">
                Overall totals · {filtered.length} listed transactions
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {Array.from(overall.entries()).map(([currency, totals]) => (
                  <View
                    key={currency}
                    style={{
                      flexGrow: 1,
                      flexBasis: 280,
                      gap: 10,
                      borderWidth: 1,
                      borderColor: border,
                      backgroundColor: surface,
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <Text variant="bodyStrong" color="text">
                      {currency} · {totals.count} transactions
                    </Text>
                    <Text variant="caption" color="textMuted">
                      Successful payments ({totals.successfulCount})
                    </Text>
                    <Text variant="h2" color="text">
                      {money(totals.paid, currency)}
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      Refunded {money(totals.refunded, currency)} · Pending
                      refunds {money(totals.pendingRefund, currency)}
                    </Text>
                    <Text variant="bodyStrong" color="text">
                      Net collected: {money(totals.net, currency)}
                    </Text>
                  </View>
                ))}
                {overall.size === 0 && (
                  <Text variant="body" color="textMuted">
                    No matching transactions.
                  </Text>
                )}
              </View>
            </View>

            {grouped.map((group, index) => {
              const expanded = expandedDays[group.date] ?? index === 0;
              return (
                <View
                  key={group.date}
                  style={{
                    borderWidth: 1,
                    borderColor: border,
                    borderRadius: 12,
                    backgroundColor: surface,
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${expanded ? "Collapse" : "Expand"} transactions for ${dayLabel(group.date)}`}
                    accessibilityState={{ expanded }}
                    onPress={() =>
                      setExpandedDays((previous) => ({
                        ...previous,
                        [group.date]: !(previous[group.date] ?? index === 0),
                      }))
                    }
                    style={{ padding: 16, backgroundColor: surfaceAlt, gap: 8 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <Text variant="h3" color="text">
                        {dayLabel(group.date)}
                      </Text>
                      <Text variant="bodyStrong" color="text">
                        {group.payments.length} transactions{" "}
                        {expanded ? "−" : "+"}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      {Array.from(group.totals.entries()).map(
                        ([currency, totals]) => (
                          <View
                            key={currency}
                            style={{ gap: 3, flexGrow: 1, flexBasis: 240 }}
                          >
                            <Text variant="bodySmall" color="text">
                              {currency} · Successful{" "}
                              {money(totals.paid, currency)} · Net{" "}
                              {money(totals.net, currency)}
                            </Text>
                            <Text variant="caption" color="textMuted">
                              Refunded {money(totals.refunded, currency)} ·
                              Pending refunds{" "}
                              {money(totals.pendingRefund, currency)}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  </Pressable>
                  {expanded && (
                    <View style={{ padding: 12, gap: 10 }}>
                      <DataTable
                        columns={columns}
                        data={group.payments}
                        keyExtractor={(r) => r.paymentIntentId}
                        minTableWidth={1190}
                        actions={[{ label: "View", onPress: setChosen }]}
                        emptyMessage="No transactions for this date"
                      />
                    </View>
                  )}
                </View>
              );
            })}
            <Text variant="caption" color="textMuted">
              Dates use your device timezone. Confirm the organization&apos;s
              configured business timezone before relying on these daily
              groupings for accounting reconciliation.
            </Text>
          </>
        )}
      </ScrollView>

      <Modal
        visible={chosen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChosen(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 860,
              maxHeight: "92%",
              backgroundColor: surface,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: border,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="h2" color="text">
                  Payment details
                </Text>
                {chosen && (
                  <Text variant="caption" color="textMuted">
                    {stamp(chosen.createdAt)}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close payment details"
                onPress={() => setChosen(null)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: surfaceAlt,
                }}
              >
                <Text variant="bodyStrong" color="text">
                  Close ×
                </Text>
              </Pressable>
            </View>
            {chosen && (
              <ScrollView
                contentContainerStyle={{
                  padding: screenWidth < 600 ? 16 : 24,
                  gap: 22,
                }}
              >
                <View
                  style={{
                    padding: 22,
                    backgroundColor: surfaceAlt,
                    borderRadius: 12,
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    PAYMENT AMOUNT
                  </Text>
                  <Text variant="title" color="text">
                    {money(chosen.amountMinor, chosen.currencyCode)}
                  </Text>
                  <Text variant="bodyStrong" color="text">
                    {chosen.customerName ??
                      chosen.customerUserId ??
                      "Unknown customer"}
                  </Text>
                  <Text
                    variant="bodyStrong"
                    color={
                      isSucceeded(chosen.paymentStatus) ? "success" : "text"
                    }
                  >
                    {statusLabel(chosen.paymentStatus)}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {chosen.providerCode}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  <View
                    style={{
                      flexGrow: 1,
                      flexBasis: 200,
                      borderWidth: 1,
                      borderColor: border,
                      padding: 16,
                      borderRadius: 10,
                      gap: 6,
                    }}
                  >
                    <Text variant="caption" color="textMuted">
                      SUCCESSFUL REFUNDS
                    </Text>
                    <Text variant="h2" color="text">
                      {money(chosen.refundedMinor ?? 0, chosen.currencyCode)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexGrow: 1,
                      flexBasis: 200,
                      borderWidth: 1,
                      borderColor: border,
                      padding: 16,
                      borderRadius: 10,
                      gap: 6,
                    }}
                  >
                    <Text variant="caption" color="textMuted">
                      REFUNDS AWAITING OUTCOME
                    </Text>
                    <Text variant="h2" color="text">
                      {money(
                        chosen.reservedRefundMinor ?? 0,
                        chosen.currencyCode,
                      )}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 12 }}>
                  <Text variant="h3" color="text">
                    Payment information
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}
                  >
                    <DetailField label="Provider" value={chosen.providerCode} />
                    <DetailField
                      label="Source"
                      value={chosen.authorizationMode}
                    />
                    <DetailField label="Attempts" value={chosen.attemptCount} />
                    <DetailField
                      label="Latest attempt"
                      value={chosen.latestAttemptStatus}
                    />
                    <DetailField
                      label="Store reference"
                      value={chosen.storeId}
                    />
                    <DetailField
                      label="Staff reference"
                      value={chosen.staffId}
                    />
                  </View>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: border }} />
                <View style={{ gap: 12 }}>
                  <Text variant="h3" color="text">
                    References and linked records
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}
                  >
                    <DetailField
                      label="Payment intent ID"
                      value={chosen.paymentIntentId}
                    />
                    <DetailField
                      label="Provider transaction reference"
                      value={chosen.providerReference}
                    />
                    <DetailField
                      label="Linked subscription"
                      value={chosen.subscriptionId}
                    />
                    <DetailField
                      label="Financial exception"
                      value={chosen.financialExceptionId}
                    />
                  </View>
                </View>
                <View
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: surfaceAlt,
                    gap: 5,
                  }}
                >
                  <Text variant="bodyStrong" color="text">
                    Payment actions
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    Read-only investigation. Refund and reversal options will be
                    reviewed separately; no financial action can be performed
                    here.
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
