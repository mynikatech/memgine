import type { TransactionHistoryItem } from "@/src/data/api/customer-data-api";

type HistoryFields = Pick<
  TransactionHistoryItem,
  "transactionType" | "status" | "paymentMethod" | "refundStatus" | "receiptAvailable" | "receiptId"
>;

const readableTypes: Record<string, string> = {
  COUNTER_REDEMPTION: "Redemption",
  CUSTOMER_MEMBERSHIP: "Membership purchase",
  COUNTER_MEMBERSHIP: "Membership purchase",
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
  "ORDER_CREATED", "CREATED", "INITIATED",
]);

const normalized = (value?: string | null) => (value ?? "").trim().toUpperCase();

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
