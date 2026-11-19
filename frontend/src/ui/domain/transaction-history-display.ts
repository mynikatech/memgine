import type { TransactionHistoryItem } from "@/src/data/api/customer-data-api";

type HistoryFields = Pick<
  TransactionHistoryItem,
  "transactionType" | "status" | "paymentMethod" | "refundStatus" | "receiptAvailable" | "receiptId"
>;

const readableTypes: Record<string, string> = {
  COUNTER_REDEMPTION: "Redemption",
  CUSTOMER_MEMBERSHIP: "Membership purchase",
  COUNTER_MEMBERSHIP: "Membership purchase",
  COUNTER: "Membership purchase",
  CUSTOMER: "Membership purchase",
  MEMBERSHIP_PURCHASE: "Membership purchase",
  REFUND: "Refund",
};

const readableStatuses: Record<string, string> = {
  COMPLETED: "Completed",
  SUCCEEDED: "Payment successful",
  SUCCESS: "Completed",
  PROVIDER_SUCCEEDED: "Payment successful",
  PAID: "Paid",
  FULFILLED: "Completed",
  PROCESSING: "Payment processing",
  PROVIDER_IN_PROGRESS: "Payment processing",
  FULFILLMENT_PENDING: "Awaiting fulfillment",
  READY_FOR_PROVIDER: "Awaiting payment",
  AWAITING_PAYMENT: "Awaiting payment",
  DRAFT: "Order started",
  PENDING: "Payment pending",
  PAYMENT_PENDING: "Payment pending",
  ORDER_CREATED: "Checkout started",
  CREATED: "Checkout started",
  INITIATED: "Checkout started",
  FAILED: "Payment failed",
  PROVIDER_FAILED: "Payment failed",
  PAYMENT_FAILED: "Payment failed",
  CANCELLED: "Cancelled",
  CANCELED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  REQUESTED: "Refund requested",
  APPROVED: "Refund approved",
  REJECTED: "Refund declined",
  UNKNOWN_REQUIRES_RECONCILIATION: "Payment status needs verification",
  UNSUPPORTED_REQUIRES_MANUAL: "Awaiting manual review",
};

const paymentMethods: Record<string, string> = {
  CASH: "Cash",
  POYNT_TERMINAL: "Poynt terminal",
  REMOTE_TERMINAL: "Poynt terminal",
  POYNT: "Poynt",
  POYNT_COLLECT: "Poynt online payment",
  MONERIS: "Moneris",
  STRIPE: "Stripe",
  NO_PAYMENT: "No payment required",
  BENEFIT_OR_OFFER: "No payment required",
};

const unknownPaymentMethods = new Set([
  "CONFIGURED_PROVIDER",
  "PAYMENT_METHOD_NOT_RECORDED",
  "NOT_RECORDED",
  "UNKNOWN",
  "CUSTOMER_MEMBERSHIP",
  "COUNTER_MEMBERSHIP",
  "COUNTER_REDEMPTION",
  "MEMBERSHIP_PURCHASE",
  "REFUND",
  "PROVIDER",
  "TEST",
]);

const finalStatuses = new Set([
  "COMPLETED", "SUCCEEDED", "SUCCESS", "PROVIDER_SUCCEEDED", "PAID", "FULFILLED",
]);
const pendingStatuses = new Set([
  "PENDING", "PAYMENT_PENDING", "PROCESSING", "PROVIDER_IN_PROGRESS",
  "ORDER_CREATED", "CREATED", "INITIATED", "DRAFT", "READY_FOR_PROVIDER", "PROVIDER_SUCCEEDED",
  "AWAITING_PAYMENT", "FULFILLMENT_PENDING", "NOT_EXECUTED", "READY",
  "REQUESTED", "APPROVED", "UNKNOWN_REQUIRES_RECONCILIATION",
  "UNSUPPORTED_REQUIRES_MANUAL",
]);

const normalized = (value?: string | null) => (value ?? "").trim().toUpperCase();

export function groupCustomerOrders(rows: TransactionHistoryItem[]) {
  const byOrder = new Map<string, TransactionHistoryItem>();
  const receiptPriority = (row: TransactionHistoryItem) =>
    (row.receiptAvailable && row.receiptId ? 2 : 0) +
    (row.transactionId === row.canonicalOrderId ? 1 : 0);
  for (const row of rows) {
    const key = row.canonicalOrderId ?? row.transactionId;
    const existing = byOrder.get(key);
    if (!existing || receiptPriority(row) > receiptPriority(existing)) byOrder.set(key, row);
  }
  const orders = [...byOrder.values()].sort((a, b) =>
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.occurredAt.localeCompare(a.occurredAt));
  const current: TransactionHistoryItem[] = [];
  const past: TransactionHistoryItem[] = [];
  const seenReceipts = new Set<string>();
  for (const order of orders) {
    if (order.receiptId && seenReceipts.has(order.receiptId)) continue;
    if (order.receiptId) seenReceipts.add(order.receiptId);
    (pendingStatuses.has(normalized(order.status)) ? current : past).push(order);
  }
  return { current, past };
}

export function transactionTypeLabel(value?: string | null): string {
  return readableTypes[normalized(value)] ?? "Transaction";
}

export function transactionStatusLabel(value?: string | null): string | null {
  return readableStatuses[normalized(value)] ?? null;
}

export function transactionPaymentLabel(value?: string | null): string | null {
  const code = normalized(value);
  if (!code || unknownPaymentMethods.has(code)) return null;
  // Show only verified, recognized payment labels. Never expose provider codes.
  return paymentMethods[code] ?? null;
}

export function transactionSummary(row: HistoryFields): string {
  const type = transactionTypeLabel(row.transactionType);
  const status = transactionStatusLabel(row.status);
  const method = transactionPaymentLabel(row.paymentMethod);
  const code = normalized(row.status);
  const refundCode = normalized(row.refundStatus);
  const refund = refundCode === "SUCCEEDED" || refundCode === "REFUNDED"
    ? "Refunded"
    : refundCode === "PARTIALLY_REFUNDED"
      ? "Partially refunded"
      : null;
  // Only identify a payment method for a successful/completed transaction.
  // For a zero-payment completed redemption, 'No payment required' is meaningful.
  const payment = finalStatuses.has(code) ? method : null;
  return [type, payment, status, refund && refund !== status ? refund : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function transactionReceiptCaption(row: HistoryFields): string | null {
  if (row.receiptAvailable && row.receiptId) return null;
  const code = normalized(row.status);
  if (pendingStatuses.has(code)) return "Receipt available after completion";
  if (finalStatuses.has(code)) return "Receipt unavailable";
  // Cancelled/failed transactions must not imply a paid receipt exists.
  return null;
}
