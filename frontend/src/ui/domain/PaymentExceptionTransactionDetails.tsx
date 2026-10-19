import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Text } from "@/src/ui";
import { transactionInvestigationApi, type InvestigatedPayment } from "@/src/data/api/transaction-investigation-api";

/** Read-only investigation panel; values come only from the authorized server read model. */
export function PaymentExceptionTransactionDetails({ organizationId, paymentIntentId }: {
  organizationId: string;
  paymentIntentId: string | null | undefined;
}) {
  const [record, setRecord] = useState<InvestigatedPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async (isCurrent: () => boolean) => {
    setBusy(true); setError(""); setRecord(null);
    try {
      const response = await transactionInvestigationApi.payments(organizationId);
      if (!isCurrent()) return;
      if (!response.success) throw new Error(response.error?.message ?? "Unable to load payment details");
      setRecord(response.data.find(row => row.paymentIntentId === paymentIntentId) ?? null);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Payment details unavailable");
    } finally { if (isCurrent()) setBusy(false); }
  };
  useEffect(() => {
    let current = true;
    if (paymentIntentId) void load(() => current);
    else { setRecord(null); setError(""); }
    return () => { current = false; };
  }, [organizationId, paymentIntentId]);
  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    <View style={{ gap: 2 }}><Text variant="caption" color="textMuted">{label}</Text><Text variant="body" color="text">{value == null || value === "" ? "Not recorded" : String(value)}</Text></View>;
  return <View style={{ gap: 10, paddingVertical: 10 }}>
    <Text variant="h3" color="text">Original payment investigation</Text>
    {!paymentIntentId ? <Text variant="bodySmall" color="textMuted">No payment intent is linked to this exception. Commerce-only transactions require their own verified read model.</Text> : <>
      <Button label={busy ? "Loading payment..." : "Refresh payment details"} disabled={busy} variant="outline" onPress={() => void load(() => true)}/>
      {!!error && <Text variant="bodySmall" color="text">{error}</Text>}
      {!busy && !error && !record && <Text variant="bodySmall" color="textMuted">Payment not found or not accessible for this organization.</Text>}
      {record && <View style={{ gap: 8 }}>
        <Row label="Customer" value={record.customerName}/>
        <Row label="Payment status" value={record.paymentStatus}/>
        <Row label="Amount" value={`${record.currencyCode} ${(record.amountMinor / 100).toFixed(2)}`}/>
        <Row label="Provider" value={record.providerCode}/>
        <Row label="Authorization mode" value={record.authorizationMode}/>
        <Row label="Payment method" value="Not recorded"/>
        <Row label="Store reference" value={record.storeId}/>
        <Row label="Staff reference" value={record.staffId}/>
        <Row label="Linked membership" value={record.subscriptionId}/>
        <Row label="Payment attempts" value={record.attemptCount}/>
        <Row label="Most recent attempt" value={record.latestAttemptStatus}/>
        <Row label="Already refunded" value={`${record.currencyCode} ${(record.refundedMinor / 100).toFixed(2)}`}/>
        <Row label="Refunds pending / reserved" value={`${record.currencyCode} ${(record.reservedRefundMinor / 100).toFixed(2)}`}/>
        <Row label="Payment Intent ID" value={record.paymentIntentId}/>
        <Row label="Provider reference" value={record.providerReference}/>
      </View>}
    </>}
  </View>;
}
