import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useBusiness } from "@/src/providers";
import {
  transactionInvestigationApi,
  type InvestigatedPayment,
} from "@/src/data/api/transaction-investigation-api";
import { DataTable, Input, Text, type DataTableColumn } from "@/src/ui";

const money = (minor: number, code: string) =>
  `${code} ${(minor / 100).toFixed(2)}`;
const stamp = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
};
function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <View style={{ minWidth: 220, flex: 1, gap: 4 }}>
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
  const [rows, setRows] = useState<InvestigatedPayment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<InvestigatedPayment | null>(null);
  const [reload, setReload] = useState(0);
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
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load payments");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [organization.id, reload]);
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
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
        ].some((v) => v?.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [rows, query],
  );
  const columns = useMemo<DataTableColumn<InvestigatedPayment>[]>(
    () => [
      {
        key: "time",
        title: "Date / Time",
        width: 175,
        render: (r) => (
          <Text variant="bodySmall" color="text">
            {stamp(r.createdAt)}
          </Text>
        ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 170,
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
          <Text variant="body" color="text">
            {money(r.amountMinor, r.currencyCode)}
          </Text>
        ),
      },
      {
        key: "channel",
        title: "Source",
        width: 130,
        render: (r) => (
          <Text variant="body" color="text">
            {r.staffId ? "Staff-assisted" : "Customer / unknown"}
          </Text>
        ),
      },
      {
        key: "provider",
        title: "Payment provider",
        width: 120,
        render: (r) => (
          <Text variant="body" color="text">
            {r.providerCode}
          </Text>
        ),
      },
      {
        key: "payment",
        title: "Payment",
        width: 125,
        render: (r) => (
          <Text variant="body" color="text">
            {r.paymentStatus}
          </Text>
        ),
      },
      {
        key: "fulfillment",
        title: "Membership",
        width: 140,
        render: (r) => (
          <Text variant="body" color="text">
            {r.subscriptionId ? "Linked" : "Not linked"}
          </Text>
        ),
      },
      {
        key: "exception",
        title: "Exception",
        width: 110,
        render: (r) => (
          <Text variant="body" color="text">
            {r.financialExceptionId ? "Exists" : "None recorded"}
          </Text>
        ),
      },
    ],
    [],
  );
  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, gap: 14 }}
      >
        <Text variant="title" color="text">
          Transaction investigation
        </Text>
        <Text variant="bodySmall" color="textMuted">
          Read-only payment-intent and attempt evidence. Commerce-only
          remote/terminal payments and redemptions are not yet included; do not
          use this list as a complete transaction ledger.
        </Text>
        <Pressable onPress={() => setReload((n) => n + 1)} disabled={busy}>
          <Text variant="bodyStrong" color="text">
            Reload
          </Text>
        </Pressable>
        <Input
          label="Search transactions"
          value={query}
          onChangeText={setQuery}
          placeholder="Customer, payment, provider reference, subscription or exception"
        />
        {busy ? (
          <Text variant="body" color="textMuted">
            Loading...
          </Text>
        ) : error ? (
          <Text variant="body" color="text">
            {error}
          </Text>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(r) => r.paymentIntentId}
            minTableWidth={1150}
            actions={[{ label: "View", onPress: setChosen }]}
            emptyMessage="No matching payments"
          />
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
            justifyContent: "center",
            padding: 18,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              maxHeight: "90%",
              padding: 20,
              gap: 12,
            }}
          >
            <Pressable onPress={() => setChosen(null)}>
              <Text variant="bodyStrong" color="text">
                Close details ✕
              </Text>
            </Pressable>
            <ScrollView contentContainerStyle={{ gap: 16 }}>
              {chosen && (
                <>
                  <Text variant="h2" color="text">
                    Payment investigation
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}
                  >
                    <Field label="Customer" value={chosen.customerName} />
                    <Field label="Date" value={stamp(chosen.createdAt)} />
                    <Field
                      label="Amount"
                      value={money(chosen.amountMinor, chosen.currencyCode)}
                    />
                    <Field
                      label="Payment status"
                      value={chosen.paymentStatus}
                    />
                    <Field
                      label="Payment provider"
                      value={chosen.providerCode}
                    />
                    <Field
                      label="Payment method (card / wallet / cash)"
                      value="Not recorded"
                    />
                    <Field
                      label="Source identification"
                      value={chosen.authorizationMode}
                    />
                    <Field label="Store reference" value={chosen.storeId} />
                    <Field label="Staff reference" value={chosen.staffId} />
                    <Field
                      label="Payment intent ID"
                      value={chosen.paymentIntentId}
                    />
                    <Field
                      label="Provider transaction reference"
                      value={chosen.providerReference}
                    />
                    <Field label="Attempts" value={chosen.attemptCount} />
                    <Field
                      label="Latest attempt status"
                      value={chosen.latestAttemptStatus}
                    />
                    <Field
                      label="Linked subscription"
                      value={chosen.subscriptionId}
                    />
                    <Field
                      label="Refunds succeeded"
                      value={money(chosen.refundedMinor, chosen.currencyCode)}
                    />
                    <Field
                      label="Refunds awaiting outcome"
                      value={money(
                        chosen.reservedRefundMinor,
                        chosen.currencyCode,
                      )}
                    />
                    <Field
                      label="Financial exception"
                      value={chosen.financialExceptionId}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
