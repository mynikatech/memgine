/**
 * Regional formatting. Country != language != currency != timezone, so region
 * config is separate from locale. Wrapped in try/catch so a missing Intl
 * runtime never crashes the UI.
 */
export type RegionConfig = {
  locale: string;
  currency: string;
  timeZone?: string;
};

export const DEFAULT_REGION: RegionConfig = { locale: "en-US", currency: "USD" };

export function formatCurrency(amount: number, region: RegionConfig = DEFAULT_REGION): string {
  try {
    return new Intl.NumberFormat(region.locale, {
      style: "currency",
      currency: region.currency,
    }).format(amount);
  } catch {
    return `${region.currency} ${amount.toFixed(2)}`;
  }
}

export function formatNumber(value: number, region: RegionConfig = DEFAULT_REGION): string {
  try {
    return new Intl.NumberFormat(region.locale).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(date: Date | string, region: RegionConfig = DEFAULT_REGION): string {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(region.locale, {
      dateStyle: "medium",
      timeZone: region.timeZone,
    }).format(d);
  } catch {
    return d.toDateString();
  }
}
