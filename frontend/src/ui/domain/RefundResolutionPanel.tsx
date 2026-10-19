import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Input, ReferenceSelect, Text, TextArea } from "@/src/ui";
import { refundResolutionApi, type LinkedRefund, type RefundRequest, type ResolutionOption } from "@/src/data/api/refund-resolution-api";


const fmt = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;
const unwrap = <T,>(response: { success: boolean; data?: T; error?: {message: string} }): T => {
  if (!response.success) throw new Error(response.error?.message ?? "Refund operation failed.");
  return response.data as T;
};

/** The server is authoritative: the panel cannot approve, fake success, or bypass refund eligibility. */
export function RefundResolutionPanel({ organizationId, supportRequestId, financialExceptionId, paymentIntentId, commerceTransactionId, currencyCode, suggestedAmountMinor }: {
  organizationId: string;
  supportRequestId?: string;
  financialExceptionId?: string;
  paymentIntentId?: string | null;
  commerceTransactionId?: string | null;
  currencyCode?: string;
  suggestedAmountMinor?: number;
}) {
  const [refunds, setRefunds] = useState<LinkedRefund[]>([]);
  const [amount, setAmount] = useState("");
  const [manualPaymentIntentId, setManualPaymentIntentId] = useState("");
  const [reason, setReason] = useState("");
  const [reasons, setReasons] = useState<ResolutionOption[]>([]);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void refundResolutionApi.options(organizationId, financialExceptionId ? "PAYMENT" : "SUPPORT")
      .then(response => { if (active) {
        const list = unwrap(response).filter(item => item.type === "REFUND_REASON");
        setReasons(list);
        setReason(previous => list.some(item => item.code === previous) ? previous : "");
      } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [organizationId, financialExceptionId]);
  const load = useCallback(async () => {
    if (!supportRequestId && !financialExceptionId) return;
    const result = supportRequestId
      ? await refundResolutionApi.bySupport(organizationId, supportRequestId)
      : await refundResolutionApi.byException(organizationId, financialExceptionId!);
    setRefunds(unwrap(result));
  }, [organizationId, supportRequestId, financialExceptionId]);
  useEffect(() => { setRefunds([]); setError(""); setMessage(""); setAmount(""); keyRef.current = null; void load().catch(e => setError(String(e instanceof Error ? e.message : e))); }, [load]);
  const resolvedIntentId = paymentIntentId || (supportRequestId ? manualPaymentIntentId.trim() : "");
  const create = async () => {
    if (busy) return;
    setError(""); setMessage("");
    if (!reason || !reasons.some(item => item.code === reason)) { setError("Choose a refund reason from reference data."); return; }
    if (!!resolvedIntentId === !!commerceTransactionId) { setError("A single verified original payment must be identified before refunding."); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) { setError("Enter a positive amount with at most two decimal places."); return; }
    const [whole, cents = ""] = amount.trim().split(".");
    const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
    if (!Number.isSafeInteger(minor) || minor <= 0) { setError("Refund amount is invalid."); return; }
    if ((reason === "GOODWILL" || reason === "OTHER_APPROVED") && explanation.trim().length < 10) { setError("Explain this refund in at least 10 characters."); return; }
    if (!keyRef.current) keyRef.current = `case-refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body: RefundRequest = { paymentIntentId: resolvedIntentId || undefined, commerceTransactionId: commerceTransactionId || undefined,
      amountMinor: minor, reasonCode: reason, explanation: explanation.trim() || undefined,
      supportRequestId, financialExceptionId: resolvedIntentId ? financialExceptionId : undefined, idempotencyKey: keyRef.current };
    setBusy(true);
    try { unwrap(await refundResolutionApi.create(organizationId, body)); keyRef.current = null; setAmount(""); setMessage("Refund created and auto-approved. Execution is a separate action."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Refund creation failed."); }
    finally { setBusy(false); }
  };
  const action = async (refund: LinkedRefund, operation: "execute" | "reconcile") => {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setConfirm(null);
    try {
      const result = operation === "execute" ? await refundResolutionApi.execute(organizationId, refund.paymentRefundId) : await refundResolutionApi.reconcile(organizationId, refund.paymentRefundId);
      const status = unwrap(result);
      setMessage(`Refund status: ${status.executionStatus}. Verify provider outcome before closing the case.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Refund action failed."); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 12, paddingVertical: 12 }}>
    <Text variant="h3" color="text">Refund resolution</Text>
    <Text variant="caption" color="textMuted">Only authorized administrators can request refunds. Creating a refund does not send money; provider execution requires confirmation.</Text>
    {refunds.map(r => <View key={r.paymentRefundId} style={{ padding: 10, gap: 6, borderWidth: 1, borderColor: "#88888855", borderRadius: 8 }}>
      <Text variant="bodyStrong" color="text">{fmt(r.refundAmountMinor, r.currencyCode)} — {r.executionStatus}</Text>
      <Text variant="caption" color="textMuted">{r.paymentRefundId} · {r.originalProviderCode} · {r.approvalStatus}</Text>
      {r.executionStatus === "READY" && <Button label={confirm === r.paymentRefundId ? "Confirm provider refund" : "Execute refund"} disabled={busy} onPress={() => confirm === r.paymentRefundId ? void action(r, "execute") : setConfirm(r.paymentRefundId)}/>}
      {confirm === r.paymentRefundId && <Button label="Cancel" variant="outline" onPress={() => setConfirm(null)}/>}
      {(r.executionStatus === "PENDING" || r.executionStatus === "UNKNOWN_REQUIRES_RECONCILIATION") && <Button label="Check payment status" disabled={busy} variant="outline" onPress={() => void action(r, "reconcile")}/>}
    </View>)}
    {!paymentIntentId && !commerceTransactionId && !!supportRequestId && <Input label="Verified payment intent ID" value={manualPaymentIntentId} onChangeText={v => { setManualPaymentIntentId(v); keyRef.current = null; }} placeholder="Select or paste original payment intent ID"/>}
    {resolvedIntentId || commerceTransactionId ? <>
      <Text variant="caption" color="textMuted">Original: {paymentIntentId || commerceTransactionId}{currencyCode ? ` · ${currencyCode}` : ""}{suggestedAmountMinor != null && currencyCode ? ` · recorded ${fmt(suggestedAmountMinor, currencyCode)}` : ""}</Text>
      <Input label="Refund amount (major units)" value={amount} onChangeText={v => { setAmount(v); keyRef.current = null; }} placeholder="0.00" keyboardType="decimal-pad"/>
      <ReferenceSelect label="Refund reason" value={reason} items={reasons} getItemId={v => v.code} renderItemLabel={v => v.name} onChange={v => { setReason(v); keyRef.current = null; }}/>
      <TextArea value={explanation} onChangeText={v => { setExplanation(v); keyRef.current = null; }} placeholder="Reason/details for audit" maxLength={500}/>
      <Button label={busy ? "Processing…" : "Create auto-approved refund"} disabled={busy || !amount.trim() || !reason} onPress={() => void create()}/>
    </> : <Text variant="caption" color="textMuted">Identify a successful original payment in the investigation before initiating a refund.</Text>}
    {!!error && <Text variant="bodySmall" color="text">{error}</Text>}
    {!!message && <Text variant="bodySmall" color="text">{message}</Text>}
    <Button label="Refresh refunds" variant="outline" disabled={busy} onPress={() => void load().catch(e => setError(String(e)))}/>
  </View>;
}
