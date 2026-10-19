import { useCallback, useEffect, useMemo, useState } from "react";

import { RefundResolutionPanel } from "@/src/ui/domain/RefundResolutionPanel";

import { CaseResolutionSelector } from "@/src/ui/domain/CaseResolutionSelector";
import {
  refundResolutionApi,
  type LinkedRefund,
} from "@/src/data/api/refund-resolution-api";

import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { services } from "@/src/core";

import type {
  FinancialExceptionDetail,
  FinancialExceptionEvent,
  FinancialExceptionSummary,
} from "@/src/data/api/financial-exception-api";

import { useBusiness } from "@/src/providers";

import { COLORS } from "@/src/theme/colors";

import {
  Button,
  DataTable,
  type DataTableColumn,
  Input,
  ReferenceSelect,
  Text,
} from "@/src/ui";

const statusOptions = ["OPEN", "UNDER_REVIEW", "RESOLVED", "CLOSED"];

const sourceOptions = ["CUSTOMER_MEMBERSHIP", "COUNTER", "COUNTER_REDEMPTION"];

const fulfillmentOptions = ["UNFULFILLED", "FAILED", "UNKNOWN", "FULFILLED"];

const recoveryReasonOptions = [
  "Customer paid, but membership is missing",

  "Terminal shows successful payment",

  "Payment or activation was interrupted",

  "Customer reported a payment problem",

  "Previous recovery did not work",

  "Other",
] as const;

type RecoveryReason = (typeof recoveryReasonOptions)[number];

const recoveryGuidance: Record<RecoveryReason, string> = {
  "Customer paid, but membership is missing":
    "Choose this when a customer says they paid but cannot see or use their membership.",

  "Terminal shows successful payment":
    "Choose this when the payment terminal shows Approved or Successful, but Memgine has not completed the membership or redemption.",

  "Payment or activation was interrupted":
    "Choose this when checkout froze, closed, timed out, or lost its connection.",

  "Customer reported a payment problem":
    "Choose this when you are following up on a customer's payment complaint and no more specific option applies.",

  "Previous recovery did not work":
    "Choose this when an earlier Recover Fulfillment attempt was unsuccessful.",

  Other:
    "Choose this if none of the other reasons applies, and explain the situation below.",
};

function buildRecoveryReason(
  choice: RecoveryReason | "",

  notes: string,
): string {
  if (!choice) return "";

  const extra = notes.trim();

  return extra ? `${choice} — ${extra}` : choice;
}

type TransitionTarget = "UNDER_REVIEW" | "OPEN" | "RESOLVED" | "CLOSED";

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatAmount(amountMinor: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",

      currency: currencyCode,
    }).format(amountMinor / 100);
  } catch {
    return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
  }
}

const sourceLabels: Record<string, string> = {
  CUSTOMER_MEMBERSHIP: "Customer Membership",

  COUNTER: "Counter Membership",

  COUNTER_REDEMPTION: "Counter Redemption",
};

const statusLabels: Record<string, string> = {
  OPEN: "Open",

  UNDER_REVIEW: "Under Review",

  RESOLVED: "Resolved",

  CLOSED: "Closed",

  UNFULFILLED: "Unfulfilled",

  FULFILLED: "Fulfilled",

  FAILED: "Failed",

  UNKNOWN: "Unknown",
};

const eventLabels: Record<string, string> = {
  OPENED: "Case opened",

  STATUS_CHANGED: "Status changed",

  RECOVERY_SUCCEEDED: "Recovery succeeded",

  RECOVERY_FAILED: "Recovery failed",
};

function labelFor(value?: string | null): string {
  if (!value) return "Not available";

  if (value === "POYNT_COLLECT") return "Poynt Collect";

  return (
    sourceLabels[value] ??
    statusLabels[value] ??
    eventLabels[value] ??
    value

      .replace(/_/g, " ")

      .toLowerCase()

      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function Detail({
  label,

  value,

  compact,
}: {
  label: string;

  value?: string | null;

  compact?: boolean;
}) {
  return (
    <View style={[styles.detail, compact && styles.detailCompact]}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>

      <Text variant="body" color="text">
        {value || "Not available"}
      </Text>
    </View>
  );
}

function StatusChip({ value }: { value: string }) {
  return (
    <View
      style={[
        styles.chip,

        value === "FULFILLED" || value === "RESOLVED" || value === "CLOSED"
          ? styles.chipPositive
          : value === "OPEN" || value === "UNFULFILLED" || value === "FAILED"
            ? styles.chipAttention
            : styles.chipNeutral,
      ]}
    >
      <Text variant="bodySmall" color="text">
        {labelFor(value)}
      </Text>
    </View>
  );
}

function AuditItem({
  event,

  last,
}: {
  event: FinancialExceptionEvent;

  last: boolean;
}) {
  const changedCase =
    event.previousCaseStatus &&
    event.newCaseStatus &&
    event.previousCaseStatus !== event.newCaseStatus;

  const changedOutcome =
    event.previousFulfillmentOutcome &&
    event.newFulfillmentOutcome &&
    event.previousFulfillmentOutcome !== event.newFulfillmentOutcome;

  return (
    <View style={styles.auditRow}>
      <View style={styles.auditRail}>
        <View style={styles.auditDot} />

        {!last && <View style={styles.auditLine} />}
      </View>

      <View style={styles.auditBody}>
        <Text variant="bodyStrong" color="text">
          {labelFor(event.eventType)}
        </Text>

        <Text variant="bodySmall" color="textMuted">
          {formatDate(event.createdAt)} · {labelFor(event.actorOrigin)}
        </Text>

        <Text variant="caption" color="textMuted">
          Actor: {event.actorUserId || "System"}
        </Text>

        <Text variant="bodySmall" color="text">
          {event.description}
        </Text>

        {!!changedCase && (
          <Text variant="caption" color="textMuted">
            Case: {labelFor(event.previousCaseStatus)} →{" "}
            {labelFor(event.newCaseStatus)}
          </Text>
        )}

        {!!changedOutcome && (
          <Text variant="caption" color="textMuted">
            Fulfillment: {labelFor(event.previousFulfillmentOutcome)} →{" "}
            {labelFor(event.newFulfillmentOutcome)}
          </Text>
        )}
      </View>
    </View>
  );
}

function allowedTransitions(
  detail: FinancialExceptionDetail,
  refunds: LinkedRefund[],
  refundsLoaded: boolean,
): TransitionTarget[] {
  const unresolved = refunds.some(
    (refund) =>
      refund.executionStatus !== "SUCCEEDED" &&
      refund.executionStatus !== "FAILED",
  );
  const refunded = refunds.some(
    (refund) => refund.executionStatus === "SUCCEEDED",
  );
  const mayResolve =
    refundsLoaded &&
    !unresolved &&
    (detail.fulfillmentOutcome === "FULFILLED" || refunded);
  if (detail.caseStatus === "OPEN")
    return mayResolve ? ["UNDER_REVIEW", "RESOLVED"] : ["UNDER_REVIEW"];
  if (detail.caseStatus === "UNDER_REVIEW")
    return mayResolve ? ["OPEN", "RESOLVED"] : ["OPEN"];
  return detail.caseStatus === "RESOLVED" && refundsLoaded && !unresolved
    ? ["CLOSED"]
    : [];
}

export default function OrgAdminPaymentExceptions() {
  const { organization } = useBusiness();

  return (
    <OrganizationPaymentExceptions
      key={organization.id}
      organizationId={organization.id}
    />
  );
}

function OrganizationPaymentExceptions({
  organizationId,
}: {
  organizationId: string;
}) {
  const { width: screenWidth } = useWindowDimensions();

  const compact = screenWidth < 720;

  const [rows, setRows] = useState<FinancialExceptionSummary[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");

  const [sourceFilter, setSourceFilter] = useState("");

  const [fulfillmentFilter, setFulfillmentFilter] = useState("");

  const [selected, setSelected] = useState<FinancialExceptionSummary | null>(
    null,
  );

  const [detail, setDetail] = useState<FinancialExceptionDetail | null>(null);

  const [events, setEvents] = useState<FinancialExceptionEvent[]>([]);

  const [detailLoading, setDetailLoading] = useState(false);

  const [detailError, setDetailError] = useState<string | null>(null);

  const [target, setTarget] = useState<TransitionTarget | "">("");

  const [reason, setReason] = useState("");

  const [caseResolutionAction, setCaseResolutionAction] = useState("");
  const [linkedRefunds, setLinkedRefunds] = useState<LinkedRefund[]>([]);
  const [refundsLoaded, setRefundsLoaded] = useState(false);
  const [refundsError, setRefundsError] = useState<string | null>(null);
  const [refundsRefreshing, setRefundsRefreshing] = useState(false);

  const [confirming, setConfirming] = useState(false);

  const [saving, setSaving] = useState(false);

  const [recoveryChoice, setRecoveryChoice] = useState<RecoveryReason | "">("");

  const [recoveryNotes, setRecoveryNotes] = useState("");

  const [confirmRecovery, setConfirmRecovery] = useState(false);

  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);

    setError(null);

    try {
      setRows(await services.financialExceptions.list(organizationId));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load financial exceptions.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const refreshLinkedRefunds = useCallback(
    async (caseId: string) => {
      setRefundsRefreshing(true);
      setRefundsError(null);
      try {
        const response = await refundResolutionApi.byException(
          organizationId,
          caseId,
        );
        if (!response.success) throw new Error(response.error.message);
        setLinkedRefunds(response.data);
        setRefundsLoaded(true);
        return response.data;
      } catch (failure) {
        setRefundsLoaded(false);
        setRefundsError(
          failure instanceof Error
            ? failure.message
            : "Unable to load linked refunds.",
        );
        throw failure;
      } finally {
        setRefundsRefreshing(false);
      }
    },
    [organizationId],
  );

  const openDetail = useCallback(
    async (row: FinancialExceptionSummary) => {
      setSelected(row);

      setCaseResolutionAction("");
      setLinkedRefunds([]);
      setRefundsLoaded(false);
      setRefundsError(null);

      setDetail(null);

      setEvents([]);

      setTarget("");

      setReason("");

      setConfirming(false);

      setRecoveryChoice("");

      setRecoveryNotes("");

      setConfirmRecovery(false);

      setRecoverySuccess(null);

      setDetailLoading(true);

      setDetailError(null);

      try {
        const [nextDetail, nextEvents] = await Promise.all([
          services.financialExceptions.detail(
            organizationId,

            row.financialExceptionId,
          ),

          services.financialExceptions.events(
            organizationId,

            row.financialExceptionId,
          ),
        ]);

        setDetail(nextDetail);

        setEvents(nextEvents);
        void refreshLinkedRefunds(row.financialExceptionId).catch(
          () => undefined,
        );
      } catch (failure) {
        setDetailError(
          failure instanceof Error
            ? failure.message
            : "Unable to load financial exception details.",
        );
      } finally {
        setDetailLoading(false);
      }
    },

    [organizationId, refreshLinkedRefunds],
  );

  const closeDetail = () => {
    if (saving) return;

    setSelected(null);

    setCaseResolutionAction("");
    setLinkedRefunds([]);
    setRefundsLoaded(false);
    setRefundsError(null);

    setDetail(null);

    setEvents([]);

    setConfirming(false);
  };

  const submitTransition = async () => {
    if (!detail || !target || !reason.trim()) return;
    if (target === "RESOLVED" || target === "CLOSED") {
      try {
        const latest = await refreshLinkedRefunds(detail.financialExceptionId);
        if (!allowedTransitions(detail, latest, true).includes(target)) {
          setConfirming(false);
          setDetailError(
            "Case closure is unavailable while refund outcomes are unresolved or unverified.",
          );
          return;
        }
      } catch {
        setConfirming(false);
        return;
      }
    }

    setSaving(true);

    setDetailError(null);

    try {
      await services.financialExceptions.transition(
        organizationId,

        detail.financialExceptionId,

        { newStatus: target, reason: reason.trim() },
      );

      await Promise.all([
        loadList(),

        openDetail({ ...selected!, caseStatus: target }),
      ]);
    } catch (failure) {
      setConfirming(false);

      setDetailError(
        failure instanceof Error
          ? failure.message
          : "Unable to update the financial exception.",
      );
    } finally {
      setSaving(false);
    }
  };

  const recoveryReason = buildRecoveryReason(recoveryChoice, recoveryNotes);

  const recoveryReasonValid =
    !!recoveryChoice &&
    (recoveryChoice !== "Other" || !!recoveryNotes.trim()) &&
    recoveryReason.length <= 500;

  const submitRecovery = async () => {
    if (!detail || !recoveryReasonValid || !confirmRecovery || saving) return;

    setSaving(true);

    setDetailError(null);

    setRecoverySuccess(null);

    try {
      await services.financialExceptions.recover(
        organizationId,

        detail.financialExceptionId,

        recoveryReason,
      );

      // Refresh all three views; backend remains authoritative.

      const [nextRows, nextDetail, nextEvents] = await Promise.all([
        services.financialExceptions.list(organizationId),

        services.financialExceptions.detail(
          organizationId,

          detail.financialExceptionId,
        ),

        services.financialExceptions.events(
          organizationId,

          detail.financialExceptionId,
        ),
      ]);

      setRows(nextRows);

      setDetail(nextDetail);

      setEvents(nextEvents);

      setRecoveryChoice("");

      setRecoveryNotes("");

      setConfirmRecovery(false);

      setRecoverySuccess(
        "Fulfillment recovery completed. The case and audit history have been refreshed.",
      );
    } catch (failure) {
      setConfirmRecovery(false);

      setDetailError(
        failure instanceof Error
          ? failure.message
          : "Fulfillment recovery failed. Review the audit timeline before retrying.",
      );
    } finally {
      setSaving(false);
    }
  };

  const recoveryEligible =
    !!detail &&
    (detail.caseStatus === "OPEN" || detail.caseStatus === "UNDER_REVIEW") &&
    ["UNFULFILLED", "FAILED", "UNKNOWN"].includes(detail.fulfillmentOutcome) &&
    ((detail.sourceChannel === "CUSTOMER_MEMBERSHIP" &&
      !!detail.paymentIntentId) ||
      ((detail.sourceChannel === "COUNTER" ||
        detail.sourceChannel === "COUNTER_REDEMPTION") &&
        !!detail.commerceTransactionId));

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!statusFilter || row.caseStatus === statusFilter) &&
          (!sourceFilter || row.sourceChannel === sourceFilter) &&
          (!fulfillmentFilter || row.fulfillmentOutcome === fulfillmentFilter),
      ),

    [rows, statusFilter, sourceFilter, fulfillmentFilter],
  );

  const columns = useMemo<DataTableColumn<FinancialExceptionSummary>[]>(
    () => [
      {
        key: "source",

        title: "Source",

        width: 180,

        render: (row) => (
          <Text variant="body" color="text">
            {labelFor(row.sourceChannel)}
          </Text>
        ),
      },

      {
        key: "provider",

        title: "Provider",

        width: 150,

        render: (row) => (
          <Text variant="body" color="text">
            {labelFor(row.providerCode)}
          </Text>
        ),
      },

      {
        key: "amount",

        title: "Amount",

        width: 150,

        render: (row) => (
          <Text variant="body" color="text">
            {formatAmount(row.amountMinor, row.currencyCode)}
          </Text>
        ),
      },

      {
        key: "case",

        title: "Case status",

        width: 140,

        render: (row) => (
          <Text variant="body" color="text">
            {labelFor(row.caseStatus)}
          </Text>
        ),
      },

      {
        key: "fulfillment",

        title: "Fulfillment",

        width: 150,

        render: (row) => (
          <Text variant="body" color="text">
            {labelFor(row.fulfillmentOutcome)}
          </Text>
        ),
      },

      {
        key: "opened",

        title: "Opened",

        width: 190,

        render: (row) => (
          <Text variant="body" color="text">
            {formatDate(row.openedAt)}
          </Text>
        ),
      },
    ],

    [],
  );

  const accessDenied = /access|permission|forbidden|unauthorized/i.test(
    error ?? "",
  );

  const detailAccessDenied = /access|permission|forbidden|unauthorized/i.test(
    detailError ?? "",
  );

  const transitionItems = detail
    ? allowedTransitions(detail, linkedRefunds, refundsLoaded)
    : [];

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text variant="title" color="text">
            Financial Exceptions
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Review persisted payment and fulfillment exceptions. Payment and
            provider outcomes cannot be changed here.
          </Text>

          <Button
            label="Reload"
            variant="outline"
            size="sm"
            disabled={loading}
            onPress={() => void loadList()}
          />
        </View>

        <View style={styles.filters}>
          <ReferenceSelect
            label="Case status"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            placeholder="All case statuses"
            items={statusOptions}
            getItemId={(value) => value}
            renderItemLabel={(value) => labelFor(value)}
          />

          <ReferenceSelect
            label="Source"
            value={sourceFilter}
            onChange={setSourceFilter}
            allowClear
            placeholder="All sources"
            items={sourceOptions}
            getItemId={(value) => value}
            renderItemLabel={(value) => labelFor(value)}
          />

          <ReferenceSelect
            label="Fulfillment"
            value={fulfillmentFilter}
            onChange={setFulfillmentFilter}
            allowClear
            placeholder="All fulfillment outcomes"
            items={fulfillmentOptions}
            getItemId={(value) => value}
            renderItemLabel={(value) => labelFor(value)}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="textMuted">
              Loading financial exceptions...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text variant="body" color="text">
              {accessDenied
                ? "You do not have permission to view financial exceptions for this organization."
                : error}
            </Text>

            <Button
              label="Retry"
              variant="outline"
              onPress={() => void loadList()}
            />
          </View>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(row) => row.financialExceptionId}
            emptyMessage="No financial exceptions match the selected filters."
            actions={[
              { label: "View", onPress: (row) => void openDetail(row) },
            ]}
            minTableWidth={1100}
            actionsWidth={90}
          />
        )}
      </ScrollView>

      <NativeModal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDetail}
      >
        <View style={styles.backdrop}>
          <View
            style={[styles.dialog, { width: Math.min(screenWidth - 32, 900) }]}
          >
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitle}>
                <Text variant="title" color="text">
                  Financial exception
                </Text>

                <Text variant="caption" color="textMuted">
                  Payment evidence and case history
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                disabled={saving}
                onPress={closeDetail}
                style={styles.closeButton}
              >
                <Text variant="bodyStrong" color="textMuted">
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.dialogContent}
              showsVerticalScrollIndicator={false}
            >
              {detailLoading && (
                <View style={styles.center}>
                  <Text variant="body" color="textMuted">
                    Loading exception details...
                  </Text>
                </View>
              )}

              {detailError && (
                <View style={styles.modalSection}>
                  <Text variant="body" color="text">
                    {detailAccessDenied
                      ? "You do not have permission to view this financial exception."
                      : detailError}
                  </Text>

                  <Button
                    label="Retry"
                    variant="outline"
                    onPress={() => selected && void openDetail(selected)}
                  />
                </View>
              )}

              {detail && (
                <View style={styles.modalContent}>
                  <View style={styles.summary}>
                    <Text variant="h2" color="text">
                      {labelFor(detail.sourceChannel)}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {labelFor(detail.providerCode)}
                    </Text>

                    <Text variant="title" color="text">
                      {formatAmount(detail.amountMinor, detail.currencyCode)}
                    </Text>

                    <View style={styles.chipRow}>
                      <StatusChip value={detail.caseStatus} />

                      <StatusChip value={detail.fulfillmentOutcome} />
                    </View>
                  </View>

                  <View style={styles.sectionCard}>
                    <Text variant="h2" color="text">
                      Payment and fulfillment evidence
                    </Text>

                    <View style={styles.detailsGrid}>
                      <Detail
                        label="Exception ID"
                        value={detail.financialExceptionId}
                        compact={compact}
                      />

                      <Detail
                        label="Classification"
                        value={labelFor(detail.classification)}
                        compact={compact}
                      />

                      <Detail
                        label="Evidence"
                        value={detail.evidenceReason}
                        compact={compact}
                      />

                      <Detail
                        label="Payment intent"
                        value={detail.paymentIntentId}
                        compact={compact}
                      />

                      <Detail
                        label="Commerce transaction"
                        value={detail.commerceTransactionId}
                        compact={compact}
                      />

                      <Detail
                        label="Provider reference"
                        value={detail.providerReferenceId}
                        compact={compact}
                      />

                      <Detail
                        label="Provider transaction"
                        value={detail.providerTransactionId}
                        compact={compact}
                      />
                    </View>

                    <View style={styles.datesGrid}>
                      <Detail
                        label="Opened"
                        value={formatDate(detail.openedAt)}
                        compact={compact}
                      />

                      <Detail
                        label="Updated"
                        value={formatDate(detail.updatedAt)}
                        compact={compact}
                      />

                      <Detail
                        label="Resolved"
                        value={
                          detail.resolvedAt
                            ? formatDate(detail.resolvedAt)
                            : null
                        }
                        compact={compact}
                      />
                    </View>
                  </View>

                  <View style={styles.sectionCard}>
                    <Text variant="h2" color="text">
                      Audit timeline
                    </Text>

                    {events.length ? (
                      [...events]

                        .sort(
                          (a, b) =>
                            new Date(a.createdAt).getTime() -
                            new Date(b.createdAt).getTime(),
                        )

                        .map((event, index, ordered) => (
                          <AuditItem
                            key={event.eventId}
                            event={event}
                            last={index === ordered.length - 1}
                          />
                        ))
                    ) : (
                      <Text variant="bodySmall" color="textMuted">
                        No audit events are available for this exception.
                      </Text>
                    )}
                  </View>

                  {detail.caseStatus !== "CLOSED" && (
                    <View style={styles.sectionCard}>
                      <CaseResolutionSelector
                        key={`${detail.financialExceptionId}:resolution`}
                        organizationId={organizationId}
                        scope="PAYMENT"
                        showIssue
                        action={caseResolutionAction}
                        onActionChange={setCaseResolutionAction}
                      />
                    </View>
                  )}

                  {caseResolutionAction === "REFUND" &&
                    detail.paymentIntentId &&
                    detail.caseStatus !== "CLOSED" && (
                      <View style={styles.sectionCard}>
                        <RefundResolutionPanel
                          key={`${detail.financialExceptionId}:refund`}
                          organizationId={organizationId}
                          financialExceptionId={detail.financialExceptionId}
                          paymentIntentId={detail.paymentIntentId}
                          currencyCode={detail.currencyCode}
                          suggestedAmountMinor={detail.amountMinor}
                        />
                      </View>
                    )}

                  {caseResolutionAction === "RECOVER" && recoveryEligible && (
                    <View style={styles.sectionCard}>
                      <Text variant="h2" color="text">
                        Fix membership / redemption
                      </Text>

                      <Text variant="bodySmall" color="text">
                        Memgine found a payment that needs attention because the
                        membership or redemption is not yet complete.
                      </Text>

                      <Text variant="bodyStrong" color="text">
                        Before you continue
                      </Text>

                      <Text variant="bodySmall" color="textMuted">
                        Check the customer&apos;s details, payment amount and
                        transaction reference against the receipt or customer
                        complaint.
                      </Text>

                      <Text variant="bodySmall" color="textMuted">
                        Memgine will check its own verified payment records
                        again before trying to complete the membership or
                        redemption. This action will not charge the customer
                        again or issue a refund.
                      </Text>

                      <ReferenceSelect
                        label="Why are you taking action?"
                        value={recoveryChoice}
                        onChange={(value) => {
                          setRecoveryChoice(value as RecoveryReason);

                          setConfirmRecovery(false);
                        }}
                        items={[...recoveryReasonOptions]}
                        getItemId={(value) => value}
                        renderItemLabel={(value) => value}
                        placeholder="Choose what happened"
                        disabled={saving}
                      />

                      {!!recoveryChoice && (
                        <Text variant="bodySmall" color="textMuted">
                          {recoveryGuidance[recoveryChoice]}
                        </Text>
                      )}

                      <Input
                        label={
                          recoveryChoice === "Other"
                            ? "Additional details (required)"
                            : "Additional details (optional)"
                        }
                        value={recoveryNotes}
                        onChangeText={(value) => {
                          setRecoveryNotes(value);

                          setConfirmRecovery(false);
                        }}
                        placeholder="What did the customer report, or what did you see on the receipt?"
                        editable={!saving}
                      />

                      <Text variant="caption" color="textMuted">
                        Do not enter card details, tokens, credentials or
                        payment payloads. Maximum 500 characters including the
                        selected reason.
                      </Text>

                      {!recoveryReasonValid && recoveryReason.length > 500 && (
                        <Text variant="caption" color="text">
                          Reason and notes must be 500 characters or fewer.
                        </Text>
                      )}

                      {!confirmRecovery ? (
                        <Button
                          label="Review recovery"
                          variant="outline"
                          disabled={!recoveryReasonValid || saving}
                          onPress={() => setConfirmRecovery(true)}
                        />
                      ) : (
                        <View style={styles.confirmation}>
                          <Text variant="bodyStrong" color="text">
                            Try to complete this membership or redemption?
                          </Text>

                          <Text variant="bodySmall" color="text">
                            Reason: {recoveryChoice}
                          </Text>

                          {!!recoveryNotes.trim() && (
                            <Text variant="bodySmall" color="text">
                              Additional details: {recoveryNotes.trim()}
                            </Text>
                          )}

                          <Text variant="bodySmall" color="textMuted">
                            Memgine will verify its saved payment evidence
                            before completing the pending membership or
                            redemption. The customer will not be charged again.
                          </Text>

                          <View style={styles.actions}>
                            <Button
                              label="Cancel"
                              variant="outline"
                              disabled={saving}
                              onPress={() => setConfirmRecovery(false)}
                            />

                            <Button
                              label={
                                saving ? "Recovering..." : "Confirm recovery"
                              }
                              disabled={saving}
                              onPress={() => void submitRecovery()}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {recoverySuccess && (
                    <Text variant="bodySmall" color="text">
                      {recoverySuccess}
                    </Text>
                  )}

                  <View style={styles.sectionCard}>
                    <Text variant="h2" color="text">
                      Case resolution &amp; closure
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      Verified fulfillment or a provider-confirmed successful
                      refund permits case resolution. Auto-approval, pending and
                      unknown refund outcomes do not mean money was returned.
                    </Text>
                    {linkedRefunds.map((refund) => (
                      <Text
                        key={refund.paymentRefundId}
                        variant="bodySmall"
                        color="text"
                      >
                        Refund {refund.paymentRefundId}: {refund.currencyCode}{" "}
                        {(refund.refundAmountMinor / 100).toFixed(2)} —{" "}
                        {refund.executionStatus}
                      </Text>
                    ))}
                    {!refundsLoaded && (
                      <Text variant="bodySmall" color="textMuted">
                        Refund eligibility could not be confirmed. Resolution is
                        unavailable.
                      </Text>
                    )}
                    {!!refundsError && (
                      <Text variant="bodySmall" color="text">
                        {refundsError}
                      </Text>
                    )}
                    <Button
                      label={
                        refundsRefreshing
                          ? "Refreshing..."
                          : "Refresh refund status"
                      }
                      variant="outline"
                      disabled={refundsRefreshing || !detail}
                      onPress={() =>
                        detail &&
                        void refreshLinkedRefunds(
                          detail.financialExceptionId,
                        ).catch(() => undefined)
                      }
                    />
                    {linkedRefunds.some(
                      (refund) =>
                        !["SUCCEEDED", "FAILED"].includes(
                          refund.executionStatus,
                        ),
                    ) && (
                      <Text variant="bodySmall" color="textMuted">
                        A linked refund requires completion or reconciliation.
                        Keep the case under review.
                      </Text>
                    )}
                  </View>
                  {transitionItems.length > 0 && (
                    <View style={styles.sectionCard}>
                      <Text variant="h2" color="text">
                        Change case status
                      </Text>

                      <Text variant="bodySmall" color="textMuted">
                        Keep this case Under Review while the financial outcome
                        is pending. This does not activate a membership or
                        complete a redemption. To help the customer, use Fix
                        membership / redemption above. Memgine will only
                        complete it if the saved payment evidence is valid.
                      </Text>

                      <ReferenceSelect
                        label="New case status"
                        value={target}
                        onChange={(value) => {
                          setTarget(value as TransitionTarget);

                          setConfirming(false);
                        }}
                        items={transitionItems}
                        getItemId={(value) => value}
                        renderItemLabel={(value) => labelFor(value)}
                        placeholder="Select allowed status"
                        disabled={saving}
                      />

                      <Input
                        label="Reason"
                        value={reason}
                        onChangeText={(value) => {
                          setReason(value);

                          setConfirming(false);
                        }}
                        placeholder="Explain this administrative lifecycle change"
                        editable={!saving}
                      />

                      {!confirming ? (
                        <Button
                          label="Review change"
                          disabled={!target || !reason.trim() || saving}
                          onPress={() => setConfirming(true)}
                        />
                      ) : (
                        <View style={styles.confirmation}>
                          <Text variant="bodyStrong" color="text">
                            Confirm change to {labelFor(target)}?
                          </Text>

                          <Text variant="bodySmall" color="textMuted">
                            This records your written reason in the audit
                            history. It does not change payment or fulfillment
                            evidence.
                          </Text>

                          <View style={styles.actions}>
                            <Button
                              label="Cancel"
                              variant="outline"
                              disabled={saving}
                              onPress={() => setConfirming(false)}
                            />

                            <Button
                              label="Confirm status change"
                              disabled={saving}
                              onPress={() => void submitTransition()}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </NativeModal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },

  screen: { padding: 18, gap: 18 },

  header: { gap: 8 },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 14 },

  center: {
    minHeight: 140,

    justifyContent: "center",

    alignItems: "center",

    gap: 12,
  },

  backdrop: {
    flex: 1,

    backgroundColor: "rgba(15,23,42,0.52)",

    justifyContent: "center",

    alignItems: "center",

    paddingVertical: 18,
  },

  dialog: {
    maxHeight: "94%",

    backgroundColor: COLORS.surface,

    borderRadius: 16,

    overflow: "hidden",
  },

  dialogHeader: {
    paddingHorizontal: 22,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: COLORS.border,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 12,
  },

  dialogTitle: { flex: 1, gap: 4 },

  closeButton: {
    width: 36,

    height: 36,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 18,

    borderWidth: 1,

    borderColor: COLORS.border,
  },

  dialogContent: { padding: 20, paddingBottom: 28 },

  modalContent: { gap: 16 },

  modalSection: { gap: 12 },

  summary: {
    padding: 18,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: COLORS.border,

    gap: 9,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  chip: {
    borderRadius: 16,

    borderWidth: 1,

    paddingVertical: 5,

    paddingHorizontal: 11,
  },

  chipPositive: { backgroundColor: "#e9f7ef", borderColor: "#b6dfc3" },

  chipAttention: { backgroundColor: "#fff4e7", borderColor: "#efd0a1" },

  chipNeutral: { backgroundColor: "#eff3f7", borderColor: "#d4dde6" },

  sectionCard: {
    borderWidth: 1,

    borderColor: COLORS.border,

    borderRadius: 12,

    padding: 18,

    gap: 14,
  },

  detailsGrid: {
    flexDirection: "row",

    flexWrap: "wrap",

    columnGap: 16,

    rowGap: 14,
  },

  datesGrid: {
    flexDirection: "row",

    flexWrap: "wrap",

    columnGap: 16,

    rowGap: 14,

    borderTopWidth: 1,

    borderTopColor: COLORS.border,

    paddingTop: 14,
  },

  detail: { width: "46%", minWidth: 0, gap: 4 },

  detailCompact: { width: "100%" },

  confirmation: {
    gap: 10,

    padding: 12,

    borderWidth: 1,

    borderColor: COLORS.border,

    borderRadius: 8,
  },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  auditRow: { flexDirection: "row", gap: 12 },

  auditRail: { width: 14, alignItems: "center" },

  auditDot: {
    width: 10,

    height: 10,

    borderRadius: 5,

    backgroundColor: COLORS.accent,

    marginTop: 5,
  },

  auditLine: {
    width: 2,

    flex: 1,

    minHeight: 26,

    backgroundColor: COLORS.border,

    marginTop: 3,
  },

  auditBody: { flex: 1, minWidth: 0, gap: 5, paddingBottom: 20 },
});
