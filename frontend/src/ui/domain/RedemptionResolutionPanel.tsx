import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Text, TextArea } from "@/src/ui";
import {
  redemptionResolutionApi,
  type RedemptionResolutionCandidate,
  type RedemptionResolutionAction,
  type RedemptionResolutionResult,
} from "@/src/data/api/redemption-resolution-api";
import {
  refundResolutionApi,
  type ResolutionOption,
} from "@/src/data/api/refund-resolution-api";

const choices: { action: RedemptionResolutionAction; label: string }[] = [
  { action: "RESTORE_ONLY", label: "Restore Only" },
  { action: "REFUND_ONLY", label: "Refund Only" },
  { action: "REFUND_AND_RESTORE", label: "Refund + Restore" },
];
function unwrap<T>(result: {
  success: boolean;
  data?: T;
  error?: { message: string };
}): T {
  if (!result.success)
    throw new Error(result.error?.message ?? "Operation failed");
  return result.data as T;
}
/** Shared action editor. Caller owns the selected redemption and its customer scoping. */
export function RedemptionResolutionPanel({
  organizationId,
  item,
  supportRequestId,
  readOnly = false,
  onChanged,
}: {
  organizationId: string;
  item: RedemptionResolutionCandidate;
  supportRequestId?: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [reasons, setReasons] = useState<ResolutionOption[]>([]);
  const selected = item;
  const [action, setAction] =
    useState<RedemptionResolutionAction>("RESTORE_ONLY");
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [resolution, setResolution] =
    useState<RedemptionResolutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [executeAttempted, setExecuteAttempted] = useState(false);
  const [refundExecutionStatus, setRefundExecutionStatus] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const key = useRef<string | null>(null);

  const reload = useCallback(async () => {
    onChanged?.();
  }, [onChanged]);
  useEffect(() => {
    let active = true;
    void Promise.all([refundResolutionApi.options(organizationId, "SUPPORT")])
      .then(([reasonResult]) => {
        if (!active) return;
        setReasons(
          unwrap(reasonResult).filter((item) => item.type === "REFUND_REASON"),
        );
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [organizationId]);
  const pick = (item: RedemptionResolutionCandidate) => {
    setAction("RESTORE_ONLY");
    setReason("");
    setExplanation("");
    setResolution(null);
    setError("");
    setNotice("");
    setConfirmed(false);
    setExecuteAttempted(false);
    setRefundExecutionStatus(null);
    key.current = null;
    if (item.resolutionId) {
      void redemptionResolutionApi
        .detail(organizationId, item.resolutionId)
        .then(async (response) => {
          const detail = unwrap(response);
          setResolution({
            resolutionId: item.resolutionId!,
            actionStatus: detail.actionStatus,
            paymentRefundId: detail.paymentRefundId,
          });
          if (detail.paymentRefundId) {
            const payment = unwrap(
              await refundResolutionApi.execution(
                organizationId,
                detail.paymentRefundId,
              ),
            );
            setRefundExecutionStatus(payment.executionStatus);
            setExecuteAttempted(payment.executionStatus !== "READY");
          }
        })
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Unable to load resolution",
          ),
        );
    }
  };
  useEffect(() => {
    pick(item);
  }, [organizationId, item.itemId, item.resolutionId]);
  const paymentPossible = Boolean(
    selected?.commerceTransactionId &&
    selected?.paymentAmountMinor &&
    selected.paymentAmountMinor > 0,
  );
  const create = async () => {
    if (
      readOnly ||
      !selected ||
      busy ||
      !confirmed ||
      !reason ||
      explanation.trim().length < 10 ||
      (action !== "RESTORE_ONLY" && !paymentPossible)
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    if (!key.current)
      key.current = `redemption-resolution-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = unwrap(
        await redemptionResolutionApi.create(organizationId, {
          redemptionTransactionItemId: selected.itemId,
          action,
          reasonCode: reason,
          explanation: explanation.trim(),
          idempotencyKey: key.current,
          supportRequestId,
        }),
      );
      setResolution(result);
      if (result.paymentRefundId) setRefundExecutionStatus("READY");
      setNotice(
        result.actionStatus === "COMPLETED"
          ? "Correction completed. The original redemption remains in history."
          : "Resolution created. Execute the linked refund only after reviewing the provider details.",
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create resolution");
    } finally {
      setBusy(false);
    }
  };
  const processRefund = async (operation: "execute" | "reconcile") => {
    if (readOnly || !resolution?.paymentRefundId || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    if (operation === "execute") setExecuteAttempted(true);
    try {
      const current = unwrap(
        operation === "execute"
          ? await refundResolutionApi.execute(
              organizationId,
              resolution.paymentRefundId,
            )
          : await refundResolutionApi.reconcile(
              organizationId,
              resolution.paymentRefundId,
            ),
      );
      setRefundExecutionStatus(current.executionStatus);
      if (current.executionStatus === "SUCCEEDED") {
        const finished = unwrap(
          await redemptionResolutionApi.complete(
            organizationId,
            resolution.resolutionId,
          ),
        );
        setResolution({ ...resolution, actionStatus: finished });
        setNotice(
          "Verified refund succeeded. Redemption resolution: " + finished,
        );
        await reload();
      } else {
        setNotice(
          `Provider refund state: ${current.executionStatus}. Do not request another refund; reconcile this one.`,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Refund needs investigation. Do not issue another refund.",
      );
    } finally {
      setBusy(false);
    }
  };
  const retryCompletion = async () => {
    if (readOnly || !resolution || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = unwrap(
        await redemptionResolutionApi.complete(
          organizationId,
          resolution.resolutionId,
        ),
      );
      setResolution({ ...resolution, actionStatus: status });
      setNotice(`Resolution status: ${status}`);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Cannot complete this resolution yet",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Text variant="h3" color="text">
        Resolution
      </Text>
      <Text variant="bodySmall" color="textMuted">
        Selected: {item.itemType} · {item.itemName} · {item.redemptionNumber}
      </Text>
      {readOnly && (
        <Text variant="bodySmall" color="textMuted">
          This support request is read-only.
        </Text>
      )}
      {selected && !selected.resolutionId && !resolution && (
        <View style={{ gap: 10 }}>
          <Text variant="bodyStrong" color="text">
            Resolution for {selected.itemName}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {choices.map((choice) => (
              <Pressable
                key={choice.action}
                disabled={
                  readOnly ||
                  busy ||
                  (choice.action !== "RESTORE_ONLY" && !paymentPossible)
                }
                onPress={() => {
                  setAction(choice.action);
                  setConfirmed(false);
                  key.current = null;
                }}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: action === choice.action ? "#447a70" : "#d6dce2",
                  opacity:
                    choice.action !== "RESTORE_ONLY" && !paymentPossible
                      ? 0.4
                      : 1,
                }}
              >
                <Text variant="body" color="text">
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentPossible ? (
            <Text variant="bodySmall" color="textMuted">
              Original commerce amount: {selected.currencyCode}{" "}
              {((selected.paymentAmountMinor ?? 0) / 100).toFixed(2)}. The
              backend verifies actual refund eligibility. Multi-item paid
              transactions require manual allocation review.
            </Text>
          ) : (
            <Text variant="bodySmall" color="textMuted">
              Refund actions are unavailable because this redemption has no
              linked chargeable counter payment. Restore Only is available.
            </Text>
          )}
          <Text variant="bodySmall" color="textMuted">
            Reason (use reference data)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {reasons.map((option) => (
              <Pressable
                key={option.code}
                onPress={() => {
                  setReason(option.code);
                  setConfirmed(false);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: option.code === reason ? "#447a70" : "#d6dce2",
                  borderRadius: 6,
                  padding: 8,
                }}
              >
                <Text variant="caption" color="text">
                  {option.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextArea
            label="Why is this correction needed?"
            value={explanation}
            onChangeText={(value) => {
              setExplanation(value);
              setConfirmed(false);
            }}
          />
          <Pressable onPress={() => setConfirmed(!confirmed)}>
            <Text variant="body" color="text">
              {confirmed ? "☑" : "☐"} I verified the redemption and selected
              resolution
            </Text>
          </Pressable>
          <Button
            label={busy ? "Processing…" : "Create resolution"}
            disabled={
              readOnly ||
              busy ||
              !confirmed ||
              !reason ||
              explanation.trim().length < 10
            }
            onPress={() => {
              void create();
            }}
          />
        </View>
      )}
      {resolution &&
        resolution.paymentRefundId &&
        resolution.actionStatus !== "COMPLETED" && (
          <View style={{ gap: 8 }}>
            <Text variant="bodyStrong" color="text">
              Linked refund: {resolution.paymentRefundId}
            </Text>
            <Text variant="bodySmall" color="textMuted">
              Execute at most once; if the outcome is uncertain, reconcile the
              existing attempt. Never create a second refund.
            </Text>
            <Text variant="caption" color="textMuted">
              Refund state: {refundExecutionStatus ?? "Unknown"}
            </Text>
            <Button
              label="Execute verified refund"
              disabled={
                readOnly ||
                busy ||
                executeAttempted ||
                refundExecutionStatus !== "READY"
              }
              onPress={() => {
                void processRefund("execute");
              }}
            />
            <Button
              label="Reconcile refund"
              disabled={readOnly || busy || refundExecutionStatus === "READY"}
              onPress={() => {
                void processRefund("reconcile");
              }}
            />
            <Button
              label="Complete / retry local resolution"
              disabled={
                readOnly || busy || refundExecutionStatus !== "SUCCEEDED"
              }
              onPress={() => {
                void retryCompletion();
              }}
            />
          </View>
        )}
      {!!notice && (
        <Text variant="bodySmall" color="text">
          {notice}
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
