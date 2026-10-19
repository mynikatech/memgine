import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { CustomerPaymentSelector } from "@/src/ui/domain/CustomerPaymentSelector";
import type { InvestigatedPayment } from "@/src/data/api/transaction-investigation-api";
import { Button, Input, ReferenceSelect, Text, TextArea } from "@/src/ui";
import {
  refundResolutionApi,
  type LinkedRefund,
  type RefundRequest,
  type ResolutionOption,
} from "@/src/data/api/refund-resolution-api";
const fmt = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;
const unwrap = <T,>(response: {
  success: boolean;
  data?: T;
  error?: { message: string };
}): T => {
  if (!response.success)
    throw new Error(response.error?.message ?? "Refund operation failed.");
  return response.data as T;
};
/** The server is authoritative: the panel cannot approve, fake success, or bypass refund eligibility. */
export function RefundResolutionPanel({
  organizationId,
  supportRequestId,
  financialExceptionId,
  paymentIntentId,
  commerceTransactionId,
  currencyCode,
  suggestedAmountMinor,
  resolutionAction = "REFUND",
  readOnly = false,
  canCreate = true,
  onRefundsLoaded,
}: {
  organizationId: string;
  supportRequestId?: string;
  financialExceptionId?: string;
  paymentIntentId?: string | null;
  commerceTransactionId?: string | null;
  currencyCode?: string;
  suggestedAmountMinor?: number;
  resolutionAction?: "REFUND" | "REFUND_AND_CANCEL";
  readOnly?: boolean;
  canCreate?: boolean;
  onRefundsLoaded?: (refunds: LinkedRefund[]) => void;
}) {
  const [refunds, setRefunds] = useState<LinkedRefund[]>([]);
  const [amount, setAmount] = useState("");
  const [selectedPayment, setSelectedPayment] =
    useState<InvestigatedPayment | null>(null);
  const [membershipActionStatus, setMembershipActionStatus] = useState<
    Record<string, string>
  >({});
  const [reason, setReason] = useState("");
  const [reasons, setReasons] = useState<ResolutionOption[]>([]);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showNewRefund, setShowNewRefund] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void refundResolutionApi
      .options(organizationId, financialExceptionId ? "PAYMENT" : "SUPPORT")
      .then((response) => {
        if (active) {
          const list = unwrap(response).filter(
            (item) => item.type === "REFUND_REASON",
          );
          setReasons(list);
          setReason((previous) =>
            list.some((item) => item.code === previous) ? previous : "",
          );
        }
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [organizationId, financialExceptionId]);
  const load = useCallback(async () => {
    if (!supportRequestId && !financialExceptionId) return;
    const result = supportRequestId
      ? await refundResolutionApi.bySupport(organizationId, supportRequestId)
      : await refundResolutionApi.byException(
          organizationId,
          financialExceptionId!,
        );
    const loaded = unwrap(result);
    setRefunds(loaded);
    onRefundsLoaded?.(loaded);
  }, [organizationId, supportRequestId, financialExceptionId, onRefundsLoaded]);
  useEffect(() => {
    setRefunds([]);
    setError("");
    setMessage("");
    setAmount("");
    keyRef.current = null;
    void load().catch((e) =>
      setError(String(e instanceof Error ? e.message : e)),
    );
  }, [load]);
  const resolvedIntentId =
    selectedPayment?.paymentIntentId || paymentIntentId || "";
  const activeCurrency = selectedPayment?.currencyCode || currencyCode;
  const onPaymentSelect = (payment: InvestigatedPayment | null) => {
    setSelectedPayment(payment);
    keyRef.current = null;
    setAmount("");
  };
  const checkMembershipAction = async (refundId: string) => {
    try {
      const result = unwrap(
        await refundResolutionApi.completeMembershipAction(
          organizationId,
          refundId,
        ),
      );
      setMembershipActionStatus((previous) => ({
        ...previous,
        [refundId]: result?.actionStatus ?? "NO_CANCELLATION",
      }));
      setMessage(
        result?.actionStatus === "COMPLETED"
          ? "Refund confirmed and linked membership cancelled."
          : result?.actionStatus === "NEEDS_REVIEW"
            ? "Refund completed, but membership cancellation needs review. Do not issue another refund."
            : "Membership cancellation is waiting for a verified successful refund.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to check linked membership cancellation.",
      );
    }
  };
  const create = async () => {
    if (busy || readOnly) return;
    setError("");
    setMessage("");
    if (!reason || !reasons.some((item) => item.code === reason)) {
      setError("Choose a refund reason from reference data.");
      return;
    }
    if (
      resolutionAction === "REFUND_AND_CANCEL" &&
      selectedPayment &&
      !selectedPayment.subscriptionId
    ) {
      setError(
        "This payment has no linked membership. Choose Refund customer instead.",
      );
      return;
    }
    if (!!resolvedIntentId === !!commerceTransactionId) {
      setError(
        "A single verified original payment must be identified before refunding.",
      );
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter a positive amount with at most two decimal places.");
      return;
    }
    const [whole, cents = ""] = amount.trim().split(".");
    const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
    if (!Number.isSafeInteger(minor) || minor <= 0) {
      setError("Refund amount is invalid.");
      return;
    }
    if (
      (reason === "GOODWILL" || reason === "OTHER_APPROVED") &&
      explanation.trim().length < 10
    ) {
      setError("Explain this refund in at least 10 characters.");
      return;
    }
    if (!keyRef.current)
      keyRef.current = `case-refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body: RefundRequest = {
      paymentIntentId: resolvedIntentId || undefined,
      commerceTransactionId: commerceTransactionId || undefined,
      amountMinor: minor,
      reasonCode: reason,
      explanation: explanation.trim() || undefined,
      supportRequestId,
      financialExceptionId: resolvedIntentId ? financialExceptionId : undefined,
      idempotencyKey: keyRef.current,
      resolutionAction,
    };
    setBusy(true);
    try {
      unwrap(await refundResolutionApi.create(organizationId, body));
      keyRef.current = null;
      setAmount("");
      setShowNewRefund(false);
      setMessage("Refund request created. Confirm execution below when ready.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Refund creation failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const action = async (
    refund: LinkedRefund,
    operation: "execute" | "reconcile",
  ) => {
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    setMessage("");
    setConfirm(null);
    try {
      const result =
        operation === "execute"
          ? await refundResolutionApi.execute(
              organizationId,
              refund.paymentRefundId,
            )
          : await refundResolutionApi.reconcile(
              organizationId,
              refund.paymentRefundId,
            );
      const status = unwrap(result);
      setMessage(
        status.executionStatus === "SUCCEEDED"
          ? "Refund confirmed successful."
          : `Refund status: ${status.executionStatus}. Do not close the case until it is confirmed successful.`,
      );
      if (
        status.executionStatus === "SUCCEEDED" &&
        resolutionAction === "REFUND_AND_CANCEL"
      )
        await checkMembershipAction(refund.paymentRefundId);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Refund action failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const latest = refunds[0] ?? null;
  const hasOutstanding = refunds.some((r) =>
    ["READY", "PENDING", "UNKNOWN_REQUIRES_RECONCILIATION"].includes(
      r.executionStatus,
    ),
  );
  const allowNew =
    !readOnly &&
    canCreate &&
    !hasOutstanding &&
    (refunds.length === 0 || showNewRefund);
  return (
    <View style={{ gap: 14 }}>
      {!latest && !canCreate && (
        <Text variant="bodySmall" color="textMuted">
          No refund is currently linked to this request. Select a refund
          resolution to create one.
        </Text>
      )}
      {!!latest &&
        refunds.map((r, i) => (
          <View
            key={r.paymentRefundId}
            style={{
              borderWidth: 1,
              borderColor: "#9AA5B555",
              borderRadius: 12,
              padding: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <View style={{ gap: 3 }}>
                <Text variant="caption" color="textMuted">
                  {i === 0 ? "Latest refund" : "Earlier refund"}
                </Text>
                <Text variant="h3" color="text">
                  {fmt(r.refundAmountMinor, r.currencyCode)}
                </Text>
              </View>
              <Text variant="bodyStrong" color="text">
                {r.executionStatus === "SUCCEEDED"
                  ? "✓ Completed"
                  : r.executionStatus.replaceAll("_", " ")}
              </Text>
            </View>
            {r.executionStatus === "SUCCEEDED" ? (
              <Text variant="bodySmall" color="textMuted">
                Refund verified successful.
                {resolutionAction === "REFUND"
                  ? " Membership unchanged."
                  : resolutionAction === "REFUND_AND_CANCEL"
                    ? " Review dependent membership status where applicable."
                    : ""}
              </Text>
            ) : r.executionStatus === "READY" ? (
              <>
                <Text variant="bodySmall" color="textMuted">
                  Refund request created and approved. No money has been
                  returned yet.
                </Text>
                {!readOnly && (
                  <>
                    {confirm === r.paymentRefundId && (
                      <Text variant="bodySmall" color="text">
                        Confirm returning{" "}
                        {fmt(r.refundAmountMinor, r.currencyCode)} to the
                        customer. This may move funds.
                      </Text>
                    )}
                    <Button
                      label={
                        confirm === r.paymentRefundId
                          ? `Confirm refund · ${fmt(r.refundAmountMinor, r.currencyCode)}`
                          : "Continue to refund confirmation"
                      }
                      disabled={busy}
                      onPress={() =>
                        confirm === r.paymentRefundId
                          ? void action(r, "execute")
                          : setConfirm(r.paymentRefundId)
                      }
                    />
                    {confirm === r.paymentRefundId && (
                      <Button
                        label="Back"
                        variant="outline"
                        onPress={() => setConfirm(null)}
                      />
                    )}
                  </>
                )}
              </>
            ) : ["PENDING", "UNKNOWN_REQUIRES_RECONCILIATION"].includes(
                r.executionStatus,
              ) ? (
              <>
                <Text variant="bodySmall" color="textMuted">
                  Refund outcome requires confirmation. Do not create or send
                  another refund.
                </Text>
                {!readOnly && (
                  <Button
                    label="Check refund status"
                    variant="outline"
                    disabled={busy}
                    onPress={() => void action(r, "reconcile")}
                  />
                )}
              </>
            ) : (
              <Text variant="bodySmall" color="textMuted">
                Review this refund before creating another request.
              </Text>
            )}
            {resolutionAction === "REFUND_AND_CANCEL" &&
              r.executionStatus === "SUCCEEDED" && (
                <>
                  {!!membershipActionStatus[r.paymentRefundId] && (
                    <Text variant="bodySmall" color="textMuted">
                      Membership:{" "}
                      {membershipActionStatus[r.paymentRefundId].replaceAll(
                        "_",
                        " ",
                      )}
                    </Text>
                  )}
                  {!readOnly && (
                    <Button
                      label="Check linked membership cancellation"
                      variant="outline"
                      disabled={busy}
                      onPress={() =>
                        void checkMembershipAction(r.paymentRefundId)
                      }
                    />
                  )}
                </>
              )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDetails(!showDetails)}
            >
              <Text variant="caption" color="textMuted">
                {showDetails
                  ? "Hide transaction reference"
                  : "View transaction reference"}
              </Text>
            </Pressable>
            {showDetails && (
              <Text variant="caption" color="textMuted">
                {r.paymentRefundId} · {r.originalProviderCode} ·{" "}
                {r.approvalStatus}
              </Text>
            )}
          </View>
        ))}
      {allowNew && (
        <View
          style={{
            gap: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: "#9AA5B555",
            borderRadius: 12,
          }}
        >
          <Text variant="bodyStrong" color="text">
            {resolutionAction === "REFUND_AND_CANCEL"
              ? "Refund and cancel membership"
              : "Refund customer"}
          </Text>
          {!!supportRequestId && (
            <CustomerPaymentSelector
              organizationId={organizationId}
              supportRequestId={supportRequestId}
              onSelect={onPaymentSelect}
            />
          )}
          {resolvedIntentId || commerceTransactionId ? (
            <>
              <Text variant="bodySmall" color="textMuted">
                Original payment{" "}
                {selectedPayment
                  ? fmt(
                      selectedPayment.amountMinor,
                      selectedPayment.currencyCode,
                    )
                  : suggestedAmountMinor != null && activeCurrency
                    ? fmt(suggestedAmountMinor, activeCurrency)
                    : activeCurrency || ""}
              </Text>
              {resolutionAction === "REFUND_AND_CANCEL" && (
                <Text variant="caption" color="textMuted">
                  The linked membership will be cancelled only after verified
                  refund success.
                </Text>
              )}
              <Input
                label={`Refund amount${activeCurrency ? ` (${activeCurrency})` : ""}`}
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  keyRef.current = null;
                }}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <ReferenceSelect
                label="Reason"
                value={reason}
                items={reasons}
                getItemId={(v) => v.code}
                renderItemLabel={(v) => v.name}
                onChange={(v) => {
                  setReason(v);
                  keyRef.current = null;
                }}
              />
              <TextArea
                label="Details (optional unless required by reason)"
                value={explanation}
                onChangeText={(v) => {
                  setExplanation(v);
                  keyRef.current = null;
                }}
                placeholder="Brief explanation"
                maxLength={500}
              />
              <Button
                label={busy ? "Processing…" : "Create refund request"}
                disabled={
                  busy ||
                  !amount.trim() ||
                  !reason ||
                  (resolutionAction === "REFUND_AND_CANCEL" &&
                    !!selectedPayment &&
                    !selectedPayment.subscriptionId)
                }
                onPress={() => void create()}
              />
            </>
          ) : (
            <Text variant="bodySmall" color="textMuted">
              Select the customer&apos;s original payment to continue.
            </Text>
          )}
        </View>
      )}
      {!!error && (
        <Text variant="bodySmall" color="danger">
          {error}
        </Text>
      )}
      {!!message && (
        <Text variant="bodySmall" color="textMuted">
          {message}
        </Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {!readOnly && canCreate && !hasOutstanding && refunds.length > 0 && (
          <Button
            label={showNewRefund ? "Cancel new request" : "New refund"}
            variant="outline"
            onPress={() => setShowNewRefund(!showNewRefund)}
          />
        )}
        <Button
          label="Refresh refund status"
          variant="outline"
          disabled={busy}
          onPress={() =>
            void load().catch((e) =>
              setError(e instanceof Error ? e.message : String(e)),
            )
          }
        />
      </View>
    </View>
  );
}
