export function paymentMethodDisplay(method?: string | null): string {
  switch (method?.trim().toUpperCase()) {
    case "CARD":
    case "CREDIT_DEBIT":
    case "POYNT_COLLECT":
      return "Credit/Debit Card";

    case "APPLE_PAY":
      return "Apple Pay";

    case "GOOGLE_PAY":
      return "Google Pay";

    case "CASH":
      return "Cash";

    case "POYNT_TERMINAL":
    case "REMOTE_TERMINAL":
      return "Card payment at Counter";

    case "MONERIS":
      return "Credit/Debit Card";

    case "NO_PAYMENT":
      return "No payment required";

    case "TEST":
      return "Test payment";

    default:
      return "Payment method unavailable";
  }
}
