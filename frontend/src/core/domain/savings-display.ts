import type {
  AdvertisedSavingsMoney,
  AdvertisedSavings,
  MembershipPotentialSavings,
} from "./entities";

export function formatSavingsAmount(
  value?: AdvertisedSavingsMoney | null,
): string | undefined {
  if (
    !value ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor < 0 ||
    !Number.isInteger(value.decimalPlaces) ||
    value.decimalPlaces < 0 ||
    value.decimalPlaces > 20
  ) {
    return undefined;
  }
  const digits = String(value.amountMinor).padStart(
    value.decimalPlaces + 1,
    "0",
  );
  return value.decimalPlaces === 0
    ? digits
    : digits.slice(0, -value.decimalPlaces) +
        "." +
        digits.slice(-value.decimalPlaces);
}

export function formatSavingsMoney(
  value?: AdvertisedSavingsMoney | null,
): string | undefined {
  const amount = formatSavingsAmount(value);
  return value && amount !== undefined
    ? value.currency + " " + amount
    : undefined;
}

/** S2 and Counter supply the transaction currency but no precision field. */
export function formatTransactionMoney(
  amountMinor?: number | null,
  currency?: string | null,
): string | undefined {
  if (
    amountMinor == null ||
    !Number.isSafeInteger(amountMinor) ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return undefined;
  }
  const { maximumFractionDigits } = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).resolvedOptions();
  if (maximumFractionDigits === undefined) return undefined;
  const amount = formatSavingsMoney({
    amountMinor: Math.abs(amountMinor),
    currency,
    decimalPlaces: maximumFractionDigits,
  });
  return amount && amountMinor < 0 ? `−${amount}` : amount;
}

export function formatBusinessSavingsMoney(
  amount: number,
  currency: string,
): string | undefined {
  if (amount < 0) return undefined;
  let exact: string | undefined;
  try {
    exact = formatTransactionMoney(amount, currency);
  } catch {
    return undefined;
  }
  if (!exact) return undefined;
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    const precision = formatter.resolvedOptions().maximumFractionDigits;
    // At extreme magnitudes, preserve the exact minor-unit string rather than
    // risk rounding a fractional unit through IEEE-754 division.
    if (precision === undefined || amount > 1000000000000) return exact;
    const result = formatter.format(amount / 10 ** precision);
    return ["CAD", "USD"].includes(currency) ? `${result} ${currency}` : result;
  } catch {
    return exact;
  }
}

export function verifiedSavingsMoney(
  savings?: {
    verificationState: string;
    netSavingsMinor?: number | null;
    currencyCode?: string | null;
  } | null,
): string | undefined {
  if (
    savings?.verificationState !== "VERIFIED" ||
    savings.netSavingsMinor == null ||
    savings.netSavingsMinor < 0
  ) {
    return undefined;
  }
  return formatTransactionMoney(savings.netSavingsMinor, savings.currencyCode);
}

export function subscriptionSavingsDisplay(
  rows: readonly {
    coverageState: string;
    currencyCode?: string | null;
    netSavingsMinor?: number | null;
    verifiedNetSavingsMinor?: number | null;
    verifiedRedemptionCount?: number;
  }[],
) {
  const completeAmounts = new Set<string>();
  const partialAmounts = new Set<string>();
  let incomplete = false;
  for (const row of rows) {
    if (
      row.coverageState !== "COMPLETE" &&
      row.coverageState !== "NO_REDEMPTION_HISTORY"
    )
      incomplete = true;
    const amountMinor =
      row.coverageState === "COMPLETE"
        ? row.netSavingsMinor
        : row.coverageState === "PARTIAL" &&
            (row.verifiedRedemptionCount ?? 0) > 0
          ? row.verifiedNetSavingsMinor
          : undefined;
    if (amountMinor == null || amountMinor < 0) continue;
    const formatted = formatTransactionMoney(amountMinor, row.currencyCode);
    if (formatted)
      (row.coverageState === "COMPLETE" ? completeAmounts : partialAmounts).add(
        formatted,
      );
  }
  return {
    complete: [...completeAmounts],
    partial: [...partialAmounts],
    incomplete,
  };
}

export function advertisedSavingsLabel(
  savings: AdvertisedSavings | null | undefined,
  usage: "use" | "redemption",
): string | undefined {
  const amount = formatSavingsMoney(savings?.effective);
  return amount ? `Potential saving per ${usage}: up to ${amount}` : undefined;
}

export function potentialSavingsDisplay(
  savings?: MembershipPotentialSavings | null,
) {
  if (
    !savings ||
    !Number.isSafeInteger(savings.period) ||
    savings.period <= 0 ||
    typeof savings.periodUnit !== "string" ||
    !/^(day|week|month|year)$/i.test(savings.periodUnit)
  ) {
    return undefined;
  }
  const amount =
    formatBusinessSavingsMoney(savings.amountMinor, savings.currency) ??
    formatSavingsMoney(savings);
  if (!amount) return undefined;
  const unit =
    savings.periodUnit.toLowerCase() + (savings.period === 1 ? "" : "s");
  return {
    amount: `Up to ${amount}`,
    period: `${savings.period} ${unit}`,
  };
}

export function potentialSavingsValue(
  savings?: MembershipPotentialSavings | null,
): string | undefined {
  const display = potentialSavingsDisplay(savings);
  return display ? `${display.amount} over ${display.period}` : undefined;
}

export function potentialSavingsLabel(
  savings: MembershipPotentialSavings,
): string | undefined {
  const display = potentialSavingsDisplay(savings);
  if (!display) return undefined;

  const amount = display.amount.replace(/^Up to /, "");
  const term =
    savings.period === 1
      ? `your first ${savings.periodUnit.toLowerCase()}`
      : `your ${display.period} membership`;

  const prefix =
    savings.source === "OVERRIDE" || savings.complete
      ? "You could save"
      : "Based on the available benefits, you could save";

  return `${prefix} up to ${amount} over ${term}!`;
}
export function compactPotentialSavingsLabel(
  savings?: MembershipPotentialSavings | null,
): string | undefined {
  if (!savings) return undefined;

  const display = potentialSavingsDisplay(savings);
  if (!display) return undefined;

  return `Save up to ${display.amount.replace(/^Up to /, "")} over ${display.period}`;
}

export function potentialSavingsAssumptions(
  savings: MembershipPotentialSavings,
): string | undefined {
  if (!potentialSavingsValue(savings)) return undefined;

  return savings.source === "OVERRIDE"
    ? "Savings are estimated by the business. Actual savings depend on how you use your membership benefits."
    : "Actual savings depend on how often you use your membership benefits.";
}

export function readSavingsOverride(
  amount: string,
  currency: string,
  savings?: AdvertisedSavings | null,
) {
  if (!amount.trim()) return null;
  const code = currency.trim().toUpperCase() || savings?.calculated?.currency;
  if (
    !code ||
    !/^[A-Z]{3}$/.test(code) ||
    !/^\d+(?:[.,]\d+)?$/.test(amount.trim())
  )
    return undefined;
  const decimalPlaces =
    savings?.calculated?.currency === code
      ? savings.calculated.decimalPlaces
      : savings?.override?.currency === code
        ? savings.override.decimalPlaces
        : new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: code,
          }).resolvedOptions().maximumFractionDigits;
  if (
    decimalPlaces === undefined ||
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 20
  )
    return undefined;
  const [whole, fraction = ""] = amount.trim().split(/[.,]/);
  if (fraction.length > decimalPlaces) return undefined;
  const amountMinor = Number(whole + fraction.padEnd(decimalPlaces, "0"));
  return Number.isSafeInteger(amountMinor)
    ? { amountMinor, currency: code, decimalPlaces }
    : undefined;
}
