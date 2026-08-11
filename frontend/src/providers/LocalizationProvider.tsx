import { createContext, ReactNode, useContext, useMemo } from "react";

import { en, StringCatalog } from "@/src/i18n";

import { useBusiness } from "./BusinessProvider";

/**
 * LocalizationProvider — runtime string lookup + regional formatting. Reads the
 * active locale/currency/timezone from the BusinessProvider (so it must be
 * nested inside it). English only is seeded; structure supports future locales.
 */
type Vars = Record<string, string | number>;

type LocalizationValue = {
  locale: string;
  currency: string;
  timezone: string;
  isRTL: boolean;
  t: (path: string, vars?: Vars) => string;
  formatCurrency: (amount: number) => string;
  formatMoney: (amountMinor: number) => string;
  formatNumber: (value: number) => string;
  formatDate: (date: Date | string) => string;
};

const LocalizationCtx = createContext<LocalizationValue | null>(null);

function resolvePath(source: StringCatalog, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), source);
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{{${key}}}`,
  );
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { localization } = useBusiness();
  const { language, currency, timezone } = localization.active;

  const value = useMemo<LocalizationValue>(() => {
    const safe = <T,>(fn: () => T, fallback: T): T => {
      try {
        return fn();
      } catch {
        return fallback;
      }
    };
    return {
      locale: language,
      currency,
      timezone,
      isRTL: localization.isRTL,
      t: (path, vars) => interpolate(resolvePath(en, path), vars),
      formatCurrency: (amount) =>
        safe(
          () => new Intl.NumberFormat(language, { style: "currency", currency }).format(amount),
          `${currency} ${amount.toFixed(2)}`,
        ),
      formatMoney: (amountMinor) =>
        safe(
          () =>
            new Intl.NumberFormat(language, { style: "currency", currency }).format(amountMinor / 100),
          `${currency} ${(amountMinor / 100).toFixed(2)}`,
        ),
      formatNumber: (v) => safe(() => new Intl.NumberFormat(language).format(v), String(v)),
      formatDate: (date) => {
        const d = typeof date === "string" ? new Date(date) : date;
        return safe(
          () => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: timezone }).format(d),
          d.toDateString(),
        );
      },
    };
  }, [language, currency, timezone, localization.isRTL]);

  return <LocalizationCtx.Provider value={value}>{children}</LocalizationCtx.Provider>;
}

export function useTranslation(): LocalizationValue {
  const ctx = useContext(LocalizationCtx);
  if (!ctx) throw new Error("useTranslation must be used within a LocalizationProvider");
  return ctx;
}
