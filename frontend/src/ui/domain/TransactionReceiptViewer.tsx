import { useState } from "react";
import { Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { Modal, Text, Button } from "@/src/ui";
import type { TransactionReceipt } from "@/src/data/api/customer-data-api";
import {
  escapeDocumentHtml,
  isDocumentActionCancellation,
  printDocumentHtml,
  saveOrShareDocumentPdf,
} from "./document-printing";

type ReceiptAdjustment = {
  label?: string;
  type?: string;
  sourceType?: string;
  amountMinor?: number;
  appliedAmountMinor?: number;
  currency?: string;
};

type Snapshot = {
  schemaVersion?: number;
  orderNumber?: string;
  issuedAt?: string;
  organization?: { name?: string };
  store?: { name?: string; timezone?: string };
  transaction?: { id?: string; type?: string; subscriptionId?: string };
  lines?: Array<{
    description?: string;
    quantity?: number;
    unitPriceMinor?: number;
    subtotalMinor?: number;
    currency?: string;
  }>;
  adjustments?: ReceiptAdjustment[];
  discounts?: ReceiptAdjustment[];
  totals?: {
    subtotalMinor?: number;
    discountMinor?: number;
    taxMinor?: number;
    totalMinor?: number;
    currency?: string;
  };
  payment?: { method?: string; completed?: boolean; reference?: string | null };
  refund?: { id?: string; reason?: string; amountMinor?: number };
};

const money = (minor: number | undefined, currency: string | undefined) => {
  const code = currency || "CAD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format((minor ?? 0) / 100);
  } catch {
    return `${code} ${((minor ?? 0) / 100).toFixed(2)}`;
  }
};

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");

const paymentLabel = (value?: string | null) => {
  if (!value) return "Payment method not recorded";
  const known: Record<string, string> = {
    NO_PAYMENT: "No payment required",
    BENEFIT_OR_OFFER: "No payment required",
    POYNT_TERMINAL: "Poynt terminal",
    REMOTE_TERMINAL: "Poynt terminal",
    CASH: "Cash",
    CONFIGURED_PROVIDER: "Configured payment provider",
    PAYMENT_METHOD_NOT_RECORDED: "Payment method not recorded",
  };
  if (known[value]) return known[value];
  if (/^(COUNTER_REDEMPTION|MEMBERSHIP_PURCHASE)$/.test(value)) {
    return "Payment method not recorded";
  }
  return humanize(value);
};

const safeReference = (value?: string | null) =>
  value && value.length > 4 ? `••••${value.slice(-4)}` : null;

const formatIssuedAt = (value: string, timeZone?: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
};

const discountLabel = (value?: string | null) => {
  if (!value) return "Discount";
  if (/^(PRODUCT_|COUNTER_|COMMERCE_)/.test(value)) return "Applied discount";
  return value.includes("_") ? humanize(value) : value;
};

const adjustmentLabel = (item: ReceiptAdjustment) =>
  discountLabel(item.label ?? item.type ?? item.sourceType);
const adjustmentAmount = (item: ReceiptAdjustment) =>
  item.amountMinor ?? item.appliedAmountMinor;

const receiptHtml = ({
  receipt,
  snapshot,
  currency,
  adjustments,
  showDiscountSummary,
  orderNumber,
  issueDate,
  totalAmount,
  isRefund,
  statusLabel,
}: {
  receipt: TransactionReceipt;
  snapshot: Snapshot;
  currency: string | undefined;
  adjustments: ReceiptAdjustment[];
  showDiscountSummary: boolean;
  orderNumber: string;
  issueDate: string;
  totalAmount: number | undefined;
  isRefund: boolean;
  statusLabel: string;
}) => {
  const totals = snapshot.totals;
  const lineRows = (snapshot.lines ?? [])
    .map(
      (line) =>
        `<tr><td>${escapeDocumentHtml(line.description ?? "Item")} × ${line.quantity ?? 1}</td>` +
        `<td>${escapeDocumentHtml(money(line.subtotalMinor ?? line.unitPriceMinor, line.currency ?? currency))}</td></tr>`,
    )
    .join("");
  const discountRows = adjustments
    .map(
      (item) =>
        `<tr><td>${escapeDocumentHtml(adjustmentLabel(item))}</td>` +
        `<td>−${escapeDocumentHtml(money(adjustmentAmount(item), item.currency ?? currency))}</td></tr>`,
    )
    .join("");
  const subtotal = money(totals?.subtotalMinor ?? receipt.subtotalMinor, currency);
  const discount = money(totals?.discountMinor ?? receipt.discountMinor, currency);
  const tax = money(totals?.taxMinor ?? receipt.taxMinor, currency);
  const total = money(totalAmount, currency);
  const reference = safeReference(
    snapshot.payment?.reference ?? receipt.providerReference,
  );
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeDocumentHtml(receipt.receiptNumber)}</title>
<style>@page{size:A4;margin:18mm}body{font:13px Arial,sans-serif;color:#111;max-width:720px;margin:auto}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:7px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}.total{font-size:18px;font-weight:bold}.muted{color:#555}</style></head>
<body><h1>${escapeDocumentHtml(snapshot.organization?.name ?? "Memgine")}</h1>
<p class="muted">${escapeDocumentHtml(snapshot.store?.name ?? "")}<br>Order: ${escapeDocumentHtml(orderNumber)}<br>Receipt: ${escapeDocumentHtml(receipt.receiptNumber)}<br>Issued: ${escapeDocumentHtml(issueDate)}</p>
<table>${lineRows}${discountRows}
<tr><td>Subtotal</td><td>${escapeDocumentHtml(subtotal)}</td></tr>
${showDiscountSummary ? `<tr><td>Discounts</td><td>−${escapeDocumentHtml(discount)}</td></tr>` : ""}
<tr><td>Tax</td><td>${escapeDocumentHtml(tax)}</td></tr>
<tr class="total"><td>${isRefund ? "Refund amount" : "Total paid"}</td><td>${escapeDocumentHtml(total)}</td></tr></table>
<p>Payment method: ${escapeDocumentHtml(paymentLabel(snapshot.payment?.method ?? receipt.paymentMethod))}<br>${escapeDocumentHtml(statusLabel)}${reference ? `<br>Payment reference: ${escapeDocumentHtml(reference)}` : ""}</p>
</body></html>`;
};

/** Renders saved snapshot facts only; never recalculates historic prices. */
export function TransactionReceiptViewer({
  receipt,
  visible,
  onClose,
}: {
  receipt: TransactionReceipt | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [documentAction, setDocumentAction] = useState<"print" | "pdf" | null>(
    null,
  );
  const [documentError, setDocumentError] = useState<string | null>(null);
  if (!receipt) return null;

  let snapshot: Snapshot = {};
  try {
    const parsed: unknown =
      typeof receipt.receiptSnapshot === "string"
        ? JSON.parse(receipt.receiptSnapshot)
        : receipt.receiptSnapshot;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      snapshot = parsed as Snapshot;
    }
  } catch {
    snapshot = {};
  }

  const totals = snapshot.totals;
  const currency = totals?.currency ?? receipt.currencyCode;
  const adjustments = snapshot.discounts ?? snapshot.adjustments ?? [];
  // Itemized discounts already explain the discount total; do not list it twice.
  const showDiscountSummary = adjustments.length === 0;
  const orderNumber = snapshot.orderNumber ?? receipt.receiptNumber;
  const customerOrderNumber = orderNumber.startsWith("RCP-")
    ? null
    : orderNumber;
  const issueDate = formatIssuedAt(
    snapshot.issuedAt ?? receipt.issuedAt,
    snapshot.store?.timezone,
  );
  const totalAmount = totals?.totalMinor ?? receipt.totalMinor;
  const isRefund = receipt.receiptKind === "REFUND" || Boolean(snapshot.refund);
  const completed = snapshot.payment?.completed;
  const statusLabel = isRefund
    ? "Refund receipt"
    : completed === true
      ? "Payment completed"
      : completed === false
        ? "Payment status unavailable"
        : "Completed transaction receipt";

  const printableHtml = receiptHtml({
    receipt,
    snapshot,
    currency,
    adjustments,
    showDiscountSummary,
    orderNumber,
    issueDate,
    totalAmount,
    isRefund,
    statusLabel,
  });

  const runDocumentAction = async (action: "print" | "pdf") => {
    if (documentAction) return;
    setDocumentAction(action);
    setDocumentError(null);
    try {
      if (action === "print") await printDocumentHtml(printableHtml);
      else await saveOrShareDocumentPdf(printableHtml);
    } catch (error) {
      if (!isDocumentActionCancellation(error)) {
        setDocumentError(
          error instanceof Error
            ? error.message
            : "Unable to prepare this receipt document.",
        );
      }
    } finally {
      setDocumentAction(null);
    }
  };

  const share = () => {
    const message = `${snapshot.organization?.name ?? "Memgine"} receipt ${receipt.receiptNumber}\nOrder: ${orderNumber}\n${isRefund ? "Refund amount" : "Total paid"}: ${money(totalAmount, currency)}`;
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.share
    ) {
      void navigator
        .share({ title: `Receipt ${receipt.receiptNumber}`, text: message })
        .catch(() => undefined);
      return;
    }
    void Share.share({
      title: `Receipt ${receipt.receiptNumber}`,
      message,
    }).catch(() => undefined);
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Payment Receipt">
      <ScrollView
        contentContainerStyle={styles.content}
        testID="transaction-receipt-viewer"
      >
        <View style={styles.heading}>
          <Text variant="title">
            {snapshot.organization?.name ?? "Memgine"}
          </Text>
          {snapshot.store?.name ? (
            <Text variant="bodySmall" color="textMuted">
              {snapshot.store.name}
            </Text>
          ) : null}
          <Text variant="caption" color="textMuted">
            Order: {orderNumber}
          </Text>
          <Text variant="caption" color="textMuted">
            Receipt: {receipt.receiptNumber}
          </Text>
          <Text variant="caption" color="textMuted">
            Issued {issueDate}
          </Text>
        </View>

        {(snapshot.lines ?? []).map((line, index) => (
          <View
            key={`${line.description ?? "item"}-${index}`}
            style={styles.row}
          >
            <View style={styles.grow}>
              <Text variant="bodyStrong">{line.description ?? "Item"}</Text>
              <Text variant="bodySmall" color="textMuted">
                Qty {line.quantity ?? 1}
              </Text>
            </View>
            <Text variant="bodyStrong">
              {money(
                line.subtotalMinor ?? line.unitPriceMinor,
                line.currency ?? currency,
              )}
            </Text>
          </View>
        ))}

        {adjustments.map((item, index) => (
          <View
            key={`${item.label ?? item.type ?? item.sourceType ?? "adjustment"}-${index}`}
            style={styles.row}
          >
            <Text variant="bodySmall">{adjustmentLabel(item)}</Text>
            <Text variant="bodySmall">
              −{money(adjustmentAmount(item), item.currency ?? currency)}
            </Text>
          </View>
        ))}

        {snapshot.refund ? (
          <View style={styles.row}>
            <Text variant="bodyStrong">
              Refund — {snapshot.refund.reason ?? ""}
            </Text>
            <Text variant="bodyStrong">
              {money(-(snapshot.refund.amountMinor ?? 0), currency)}
            </Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Text variant="bodySmall">Subtotal</Text>
          <Text variant="bodySmall">
            {money(totals?.subtotalMinor ?? receipt.subtotalMinor, currency)}
          </Text>
        </View>
        {showDiscountSummary ? (
          <View style={styles.row}>
            <Text variant="bodySmall">Discounts</Text>
            <Text variant="bodySmall">
              −{money(totals?.discountMinor ?? receipt.discountMinor, currency)}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text variant="bodySmall">Tax</Text>
          <Text variant="bodySmall">
            {money(totals?.taxMinor ?? receipt.taxMinor, currency)}
          </Text>
        </View>
        <View style={styles.total}>
          <Text variant="title">
            {isRefund ? "Refund amount" : "Total Paid"}
          </Text>
          <Text variant="title">{money(totalAmount, currency)}</Text>
        </View>
        <Text variant="bodySmall" color="textMuted">
          Payment method:{" "}
          {paymentLabel(snapshot.payment?.method ?? receipt.paymentMethod)}
        </Text>
        <Text variant="bodySmall" color="textMuted">
          {statusLabel}
        </Text>
        {safeReference(
          snapshot.payment?.reference ?? receipt.providerReference,
        ) ? (
          <Text variant="bodySmall" color="textMuted">
            Payment reference:{" "}
            {safeReference(
              snapshot.payment?.reference ?? receipt.providerReference,
            )}
          </Text>
        ) : null}
        {documentError ? (
          <Text variant="bodySmall" color="danger">
            {documentError}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Close" variant="secondary" onPress={onClose} />
          <Button
            label={documentAction === "print" ? "Preparing..." : "Print"}
            disabled={documentAction !== null}
            onPress={() => void runDocumentAction("print")}
          />
          <Button
            label={documentAction === "pdf" ? "Preparing..." : "Save / Share PDF"}
            variant="secondary"
            disabled={documentAction !== null}
            onPress={() => void runDocumentAction("pdf")}
          />
          <Button label="Share Receipt" variant="secondary" onPress={share} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 8 },
  heading: { gap: 4 },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 10,
  },
  grow: { flex: 1 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
});
