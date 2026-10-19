import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Input, ReferenceSelect, Text } from "@/src/ui";
import {
  transactionInvestigationApi,
  type InvestigatedPayment,
} from "@/src/data/api/transaction-investigation-api";

export function CustomerPaymentSelector({
  organizationId,
  supportRequestId,
  onSelect,
}: {
  organizationId: string;
  supportRequestId: string;
  onSelect: (payment: InvestigatedPayment | null) => void;
}) {
  const [payments, setPayments] = useState<InvestigatedPayment[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setPayments([]);
    setSelected("");
    onSelect(null);
    void transactionInvestigationApi
      .supportPayments(organizationId, supportRequestId)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error.message);
        setPayments(result.data);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to retrieve payments",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, supportRequestId]);
  const filtered = useMemo(
    () =>
      payments.filter((p) =>
        [
          p.paymentIntentId,
          p.providerReference,
          p.providerCode,
          p.paymentStatus,
          p.subscriptionId,
        ].some((x) => x?.toLowerCase().includes(search.toLowerCase())),
      ),
    [payments, search],
  );
  const chosen = payments.find((p) => p.paymentIntentId === selected);
  return (
    <View style={{ gap: 10 }}>
      <Text variant="h3" color="text">
        Original customer payment
      </Text>
      <Text variant="bodySmall" color="textMuted">
        Only payments for this support ticket&apos;s customer and business are shown.
        Select a verified captured payment.
      </Text>
      <Input
        label="Search payments"
        value={search}
        onChangeText={setSearch}
        placeholder="Payment reference or subscription"
      />
      <ReferenceSelect
        label="Original payment"
        value={selected}
        items={filtered}
        getItemId={(p) => p.paymentIntentId}
        renderItemLabel={(p) =>
          `${p.createdAt.slice(0, 10)} · ${p.currencyCode} ${(p.amountMinor / 100).toFixed(2)} · ${p.paymentStatus} · ${p.providerCode} · ${p.paymentIntentId}`
        }
        onChange={(value) => {
          setSelected(value);
          onSelect(payments.find((p) => p.paymentIntentId === value) ?? null);
        }}
        placeholder={busy ? "Loading payments..." : "Select payment"}
      />
      {chosen && (
        <Text variant="bodySmall" color="textMuted">
          Attempts: {chosen.attemptCount} · Latest:{" "}
          {chosen.latestAttemptStatus ?? "Not recorded"} · Refunded:{" "}
          {chosen.currencyCode} {(chosen.refundedMinor / 100).toFixed(2)} ·
          Reserved: {chosen.currencyCode}{" "}
          {(chosen.reservedRefundMinor / 100).toFixed(2)}
        </Text>
      )}
      {!busy && !payments.length && !error && (
        <Text variant="bodySmall" color="textMuted">
          No payment intents found for this customer. A captured commerce-only
          transaction may need the separate commerce read model.
        </Text>
      )}
      {!!error && (
        <Text variant="bodySmall" color="text">
          {error}
        </Text>
      )}
    </View>
  );
}
